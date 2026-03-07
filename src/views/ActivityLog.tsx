import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock, Loader2 } from 'lucide-react';

const ActivityLog = () => {
    const [activities, setActivities] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActivities();
    }, []);

    const fetchActivities = async () => {
        setLoading(true);
        try {
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
                .order('created_at', { ascending: false });

            if (logError) throw logError;

            setActivities(logs.map((log: any) => ({
                id: log.id,
                customer: `Membresía #${log.membership.qr_code_id.split('/').pop()}`,
                date: new Date(log.created_at).toLocaleDateString(),
                time: new Date(log.created_at).toLocaleTimeString(),
                stamps: log.membership.current_stamps,
                completed: log.membership.current_stamps >= 10
            })));
        } catch (e) {
            console.error('Error fetching activities:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="animate-spin text-gold mr-3" size={32} />
                <p className="text-gold font-serif text-xl">Cargando actividad...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-serif gold-gradient font-bold">Actividad</h1>
                    <p className="text-zinc-500">Historial completo de sellos aplicados</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2 text-zinc-400 text-sm">
                    <Clock size={16} />
                    {new Date().toLocaleDateString()}
                </div>
            </div>

            <div className="glass-card p-6">
                <div className="space-y-4">
                    {activities.length === 0 ? (
                        <p className="text-center text-zinc-500 py-10">No hay actividad registrada aún.</p>
                    ) : (
                        activities.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-gold/20 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.completed ? 'bg-green-400/20 text-green-400' : 'bg-gold/20 text-gold'}`}>
                                        <CheckCircle size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">{item.customer}</p>
                                        <p className="text-zinc-500 text-xs">{item.date} {item.time} • Sellos: {item.stamps}/10</p>
                                    </div>
                                </div>
                                {item.completed && (
                                    <span className="bg-green-400/10 text-green-400 text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded border border-green-400/20">
                                        ¡Completado!
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivityLog;
