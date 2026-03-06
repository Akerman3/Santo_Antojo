import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, Star, Loader2, AlertCircle } from 'lucide-react';

const MembershipView = () => {
    const { id } = useParams<{ id: string }>();
    const [membership, setMembership] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            fetchMembership();
        }
    }, [id]);

    const fetchMembership = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            console.log('Fetching membership for ID:', id);

            // First attempt: exact match with the ID provided
            let { data } = await supabase
                .from('memberships')
                .select('*')
                .eq('qr_code_id', id)
                .maybeSingle();

            // Second attempt: if not found, it might be stored with the full URL
            if (!data) {
                const { data: altData } = await supabase
                    .from('memberships')
                    .select('*')
                    .ilike('qr_code_id', `%${id}%`)
                    .maybeSingle();
                data = altData;
            }

            if (!data) {
                console.warn('Membership not found in DB, using fallback for ID:', id);
                // Mock for demo if it starts with SA-
                if (id.startsWith('SA-')) {
                    setMembership({
                        qr_code_id: id,
                        current_stamps: 0,
                        max_stamps: 10,
                        status: 'active'
                    });
                } else {
                    setError('Membresía no encontrada.');
                }
            } else {
                console.log('Membership found:', data);
                setMembership(data);
            }
        } catch (e) {
            console.error('Error in fetchMembership:', e);
            setError('Error al conectar con el servidor.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="animate-spin text-gold" size={48} />
                <p className="text-gold font-serif text-sm tracking-widest animate-pulse">CARGANDO...</p>
            </div>
        );
    }

    if (error || !membership) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="text-red-400 mb-4" size={64} />
                <h2 className="text-2xl font-serif font-bold text-white mb-2">¡Oops!</h2>
                <p className="text-zinc-500">{error || 'No pudimos cargar tu membresía.'}</p>
                <p className="text-zinc-600 text-sm mt-4 italic">Intenta escanear el código de nuevo.</p>
            </div>
        );
    }

    const slots = Array.from({ length: membership.max_stamps || 10 });

    return (
        <div className="min-h-screen flex flex-col items-center p-6 pt-12 space-y-12">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-serif gold-gradient font-bold tracking-widest uppercase">
                    Santo Antojo
                </h1>
                <p className="text-zinc-500 tracking-[0.3em] text-xs uppercase font-medium">Membresía Exclusiva</p>
            </div>

            {/* Membership Card Visual */}
            <div className="glass-card w-full max-w-sm aspect-[1.6/1] p-8 flex flex-col justify-between relative overflow-hidden group shadow-2xl shadow-gold/5">
                {/* Glow Effects */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-gold/10 blur-[100px] rounded-full group-hover:bg-gold/20 transition-all duration-700" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-gold/5 blur-[100px] rounded-full" />

                <div className="flex justify-between items-start z-10">
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">ID de Cliente</p>
                        <p className="text-sm font-mono text-zinc-300 font-bold">{membership.qr_code_id}</p>
                    </div>
                    <Star className="text-gold" size={24} fill="currentColor" />
                </div>

                <div className="z-10">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Progreso de Recompensa</p>
                    <div className="flex flex-wrap gap-3">
                        {slots.map((_, index) => (
                            <div
                                key={index}
                                className={`stamp-slot ${index < membership.current_stamps ? 'active animate-in zoom-in' : ''}`}
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {index < membership.current_stamps && (
                                    <Check className="text-black" size={20} strokeWidth={3} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between items-end z-10">
                    <p className="text-xs text-zinc-400 italic">"Gracias por tu preferencia"</p>
                    <div className="text-right">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Faltan</p>
                        <p className="text-lg font-serif font-bold text-white">
                            {Math.max(0, membership.max_stamps - membership.current_stamps)} sellos
                        </p>
                    </div>
                </div>
            </div>

            {/* Reward Info */}
            <div className="max-w-sm w-full text-center space-y-4">
                <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                    <h3 className="text-gold font-bold uppercase tracking-widest text-sm mb-1">Tu Próximo Regalo</h3>
                    <p className="text-white text-lg font-serif">¡Colecciona 10 sellos y recibe un combo de hamburguesa gratis!</p>
                </div>

                <p className="text-zinc-500 text-xs px-8">
                    Presenta esta pantalla al cajero después de cada compra para recibir tu sello digital.
                </p>
            </div>

            {/* Decorative branding */}
            <div className="mt-auto pb-8 opacity-20 contrast-0 grayscale">
                <img src="https://images.unsplash.com/photo-1571091718767-18b5b1457add?q=80&w=2072&auto=format&fit=crop" alt="Burger" className="w-16 h-16 rounded-full object-cover" />
            </div>
        </div>
    );
};

export default MembershipView;
