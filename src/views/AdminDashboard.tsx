import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, CreditCard, CheckCircle, TrendingUp, Clock, Eye, X, Printer, Trash2, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const AdminDashboard = () => {
    const [stats, setStats] = useState({
        activeMemberships: 0,
        totalStamps: 0,
        completedMemberships: 0,
        totalBatches: 0,
    });
    const [batchList, setBatchList] = useState<any[]>([]);
    const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [deleting, setDeleting] = useState<{ id: string, count: number } | null>(null);

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

            // 2. Get batches with their memberships
            const { data: batches, error: batchError } = await supabase
                .from('batches')
                .select(`
                    id,
                    batch_number,
                    size,
                    created_at,
                    memberships (
                        id,
                        qr_code_id,
                        current_stamps,
                        status
                    )
                `)
                .order('batch_number', { ascending: false });

            if (batchError) throw batchError;

            setBatchList(batches || []);

            const active = mems.filter((m: any) => m.status === 'active').length;
            const completed = mems.filter((m: any) => m.status === 'completed').length;
            const stamps = mems.reduce((acc: number, curr: any) => acc + (curr.current_stamps || 0), 0);

            setStats({
                activeMemberships: active,
                totalStamps: stamps,
                completedMemberships: completed,
                totalBatches: batches?.length || 0,
            });

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

            // 2. Generate 50 memberships with a clean short ID
            const memberships = Array.from({ length: 50 }).map((_, i) => ({
                qr_code_id: `SA-B${batch.batch_number}-${String(i + 1).padStart(3, '0')}`,
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

    const handleDeleteBatch = async (batchId: string, batchNumber: number) => {
        if (!deleting || deleting.id !== batchId) {
            setDeleting({ id: batchId, count: 1 });
            return;
        }

        if (deleting.count < 5) {
            setDeleting({ ...deleting, count: deleting.count + 1 });
            return;
        }

        // Final deletion
        try {
            setLoading(true);
            console.log('--- STARTING BATCH DELETION ---');
            console.log('Batch ID:', batchId);

            // 1. Get all memberships for this batch
            const { data: memberships, error: fetchErr } = await supabase
                .from('memberships')
                .select('id')
                .eq('batch_id', batchId);

            if (fetchErr) {
                console.error('Error fetching memberships:', fetchErr);
                throw fetchErr;
            }

            console.log(`Found ${memberships?.length || 0} memberships to delete`);

            if (memberships && memberships.length > 0) {
                const membershipIds = memberships.map((m: any) => m.id);

                // 2. Delete logs for these memberships first
                console.log('Deleting stamps_log entries...');
                const { error: logErr } = await supabase
                    .from('stamps_log')
                    .delete()
                    .in('membership_id', membershipIds);

                if (logErr) {
                    console.error('Error deleting stamps_log:', logErr);
                    throw logErr;
                }

                // 3. Delete memberships
                console.log('Deleting membership entries...');
                const { error: memErr } = await supabase
                    .from('memberships')
                    .delete()
                    .eq('batch_id', batchId);

                if (memErr) {
                    console.error('Error deleting memberships:', memErr);
                    throw memErr;
                }
            }

            // 4. Finally delete the batch
            console.log('Deleting batch entry...');
            const { error: deleteError } = await supabase
                .from('batches')
                .delete()
                .eq('id', batchId);

            if (deleteError) {
                console.error('Error deleting batch:', deleteError);
                throw deleteError;
            }

            console.log('--- BATCH DELETION COMPLETE ---');
            alert(`Lote #${batchNumber} eliminado correctamente junto con todas sus membresías e historial.`);
            setDeleting(null);
            fetchStats();
        } catch (e: any) {
            console.error('FATAL DELETION ERROR:', e);
            alert('Error al eliminar lote: ' + (e.message || 'Error desconocido'));
            setLoading(false);
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
                <div className="lg:col-span-2 glass-card p-6 flex flex-col justify-center items-center text-center space-y-4">
                    <div className="p-4 rounded-full bg-gold/5 border border-gold/10">
                        <TrendingUp size={48} className="text-gold" />
                    </div>
                    <h3 className="text-2xl font-serif font-bold text-white">Panel Principal</h3>
                    <p className="text-zinc-500 max-w-sm">
                        Utiliza el menú de navegación inferior para acceder al escáner de códigos QR o ver el historial de actividad.
                    </p>
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
                        <div className="space-y-3">
                            {batchList.map(batch => (
                                <div key={batch.id} className="flex justify-between items-center group">
                                    <div>
                                        <span className="text-xs text-zinc-300 block">Lote #{batch.batch_number}</span>
                                        <span className="text-[10px] text-zinc-500">{batch.memberships.length} cards</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setSelectedBatch(batch)}
                                            className="p-1.5 text-gold hover:bg-gold/10 rounded-lg transition-colors"
                                            title="Ver QRs"
                                        >
                                            <Eye size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteBatch(batch.id, batch.batch_number)}
                                            className={`p-1.5 rounded-lg transition-all duration-300 flex items-center gap-1 ${deleting && deleting.id === batch.id
                                                ? 'bg-red-500 text-white px-2'
                                                : 'text-zinc-500 hover:text-red-400 hover:bg-red-400/10'
                                                }`}
                                        >
                                            {deleting && deleting.id === batch.id ? (
                                                <>
                                                    <AlertTriangle size={12} />
                                                    <span className="text-[10px] font-bold">Confirma {deleting.count}/5</span>
                                                </>
                                            ) : (
                                                <Trash2 size={14} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Batch Detail Modal */}
            {selectedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-serif font-bold text-white">Lote #{selectedBatch.batch_number}</h3>
                                <p className="text-sm text-zinc-500">{selectedBatch.memberships.length} Membresías Generadas</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-gold hover:bg-gold/10 transition-colors"
                                    title="Imprimir Lote"
                                >
                                    <Printer size={20} />
                                </button>
                                <button
                                    onClick={() => setSelectedBatch(null)}
                                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 print:block">
                            {selectedBatch.memberships.map((m: any) => {
                                // Extract the short ID if it was stored as a full URL
                                const cleanId = m.qr_code_id.split('/').pop() || m.qr_code_id;
                                return (
                                    <div key={m.id} className="bg-white p-3 rounded-lg flex flex-col items-center gap-2 print:break-inside-avoid print:mb-8">
                                        <QRCodeSVG value={`https://santo-antojo.vercel.app/membership/${cleanId}`} size={100} level="H" />
                                        <p className="text-[10px] text-zinc-900 font-mono font-bold break-all text-center">
                                            {cleanId}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
