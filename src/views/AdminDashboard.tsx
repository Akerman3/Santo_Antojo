import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, CreditCard, CheckCircle, TrendingUp, Clock } from 'lucide-react';

const AdminDashboard = () => {
    const [stats, setStats] = useState({
        activeMemberships: 0,
        totalStamps: 0,
        completedMemberships: 0,
        totalBatches: 0,
    });
    const [recentStamps, setRecentStamps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // 1. Get total memberships and stamps count
            const { data: mems, error: memError } = await supabase
                .from('memberships')
                .select('current_stamps, status');

            if (memError) throw memError;

            // 2. Get total batches
            const { count: batchCount, error: batchError } = await supabase
                .from('batches')
                .select('*', { count: 'exact', head: true });

            if (batchError) throw batchError;

            const active = mems.filter(m => m.status === 'active').length;
            const completed = mems.filter(m => m.status === 'completed').length;
            const stamps = mems.reduce((acc, curr) => acc + (curr.current_stamps || 0), 0);

            setStats({
                activeMemberships: active,
                totalStamps: stamps,
                completedMemberships: completed,
                totalBatches: batchCount || 0,
            });

            // 3. Get recent stamps activity
            const { data: logs, error: logError } = await supabase
                .from('stamps_log')
                .select(`
                    id,
                    created_at,
                    membership:memberships (
                        qr_code_id,
                        current_stamps
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(5);

            if (logError) throw logError;

            setRecentStamps(logs.map((log: any) => ({
                id: log.id,
                customer: `Membresía #${log.membership.qr_code_id}`,
                time: new Date(log.created_at).toLocaleTimeString(),
                stamps: log.membership.current_stamps,
                completed: log.membership.current_stamps >= 10
            })));

        } catch (e) {
            console.error('Error fetching stats:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Clock className="animate-spin text-gold mr-3" size={32} />
                <p className="text-gold font-serif text-xl">Cargando datos premium...</p>
            </div>
        );
    }

    const handleGenerateBatch = async () => {
        if (!window.confirm('¿Estás seguro de generar 50 nuevas membresías para el Lote #' + (stats.totalBatches + 1) + '?')) {
            return;
        }

        setGenerating(true);
        try {
            // 1. Create the batch
            const { data: batch, error: batchError } = await supabase
                .from('batches')
                .insert({ batch_number: stats.totalBatches + 1, size: 50 })
                .select()
                .single();

            if (batchError) throw batchError;

            // 2. Generate 50 memberships with the live URL as part of the ID or for the QR content
            const memberships = Array.from({ length: 50 }).map((_, i) => ({
                qr_code_id: `https://santo-antojo.vercel.app/membership/SA-B${batch.batch_number}-${String(i + 1).padStart(3, '0')}`,
                batch_id: batch.id,
                max_stamps: 10,
                current_stamps: 0,
                status: 'active'
            }));

            const { error: memError } = await supabase
                .from('memberships')
                .insert(memberships);

            if (memError) throw memError;

            alert(`¡Éxito! Se han generado 50 membresías para el Lote #${batch.batch_number}.`);
            fetchStats();
        } catch (e: any) {
            console.error(e);
            alert('Error al generar lote: ' + e.message);
        } finally {
            setGenerating(false);
        }
    };

    const statCards = [
        { label: 'Membresías Activas', value: stats.activeMemberships, icon: Users, color: 'text-blue-400' },
        { label: 'Sellos Aplicados', value: stats.totalStamps, icon: CheckCircle, color: 'text-[#D4AF37]' },
        { label: 'Premios Canjeados', value: stats.completedMemberships, icon: CreditCard, color: 'text-green-400' },
        { label: 'Lotes Generados', value: stats.totalBatches, icon: TrendingUp, color: 'text-purple-400' },
    ];

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-serif gold-gradient font-bold">Panel de Control</h1>
                    <p className="text-zinc-500">Resumen general de membresías Santo Antojo</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2 text-zinc-400 text-sm">
                    <Clock size={16} />
                    {new Date().toLocaleDateString()}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat) => (
                    <div key={stat.label} className="glass-card p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <div className={`p-2 rounded-lg bg-zinc-900 border border-zinc-800 ${stat.color}`}>
                                <stat.icon size={24} />
                            </div>
                        </div>
                        <div>
                            <p className="text-zinc-500 text-sm font-medium uppercase tracking-wider">{stat.label}</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Activity & Batch Generation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass-card p-6">
                    <h3 className="text-xl font-serif font-bold text-white mb-6">Actividad Reciente</h3>
                    <div className="space-y-4">
                        {recentStamps.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-gold/20 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.completed ? 'bg-green-400/20 text-green-400' : 'bg-gold/20 text-gold'}`}>
                                        <CheckCircle size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">{item.customer}</p>
                                        <p className="text-zinc-500 text-xs">{item.time} • Sellos: {item.stamps}/10</p>
                                    </div>
                                </div>
                                {item.completed && (
                                    <span className="bg-green-400/10 text-green-400 text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded border border-green-400/20">
                                        ¡Completado!
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-card p-6 space-y-6">
                    <h3 className="text-xl font-serif font-bold text-white">Generación de Lotes</h3>
                    <p className="text-sm text-zinc-500">
                        Genera un nuevo lote de 50 membresías únicas para imprimir en tarjetas físicas.
                    </p>

                    <div className="space-y-4">
                        <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Próximo Lote</p>
                            <p className="text-white font-bold">Lote #{stats.totalBatches + 1}</p>
                        </div>

                        <button
                            onClick={handleGenerateBatch}
                            disabled={generating}
                            className="btn-gold w-full justify-center"
                        >
                            {generating ? 'Generando...' : 'Generar Lote de 50'}
                        </button>
                    </div>

                    <div className="pt-4 border-t border-zinc-800">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Historial de Lotes</h4>
                        <div className="space-y-2">
                            {[3, 2, 1].map(n => (
                                <div key={n} className="flex justify-between items-center text-xs">
                                    <span className="text-zinc-300">Lote #00{n}</span>
                                    <span className="text-zinc-500">Completo (50/50)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
