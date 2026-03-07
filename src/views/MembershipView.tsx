import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Star, Loader2, AlertCircle } from 'lucide-react';

const MembershipView = () => {
    const { id } = useParams<{ id: string }>();
    const [membership, setMembership] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        console.log('MembershipView mounted with ID:', id);
        if (id) {
            fetchMembership();
        } else {
            console.warn('No ID provided in URL');
            setLoading(false);
            setError('Falta el código de membresía.');
        }
    }, [id]);

    const fetchMembership = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            console.log('🔍 Buscando membresía:', id);

            // 1. Try exact match
            let { data, error: fetchError } = await supabase
                .from('memberships')
                .select('*')
                .eq('qr_code_id', id)
                .maybeSingle();

            if (fetchError) console.error('Supabase error:', fetchError);

            // 2. Try substring (for legacy/full URL data)
            if (!data) {
                console.log('Exact match failed, trying substring search...');
                const { data: altData } = await supabase
                    .from('memberships')
                    .select('*')
                    .ilike('qr_code_id', `%${id}%`)
                    .maybeSingle();
                data = altData;
            }

            if (!data) {
                console.warn('❌ Not found in DB');
                if (id.includes('SA-')) {
                    console.log('Using demo fallback data');
                    setMembership({
                        qr_code_id: id,
                        current_stamps: 0,
                        max_stamps: 10,
                        status: 'active'
                    });
                } else {
                    setError('Esta tarjeta no es válida.');
                }
            } else {
                console.log('✅ Received membership:', data);
                setMembership(data);
            }
        } catch (e) {
            console.error('Fatal fetch error:', e);
            setError('Error de conexión con el servidor.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-[#0a0a0a]">
                <Loader2 className="animate-spin text-gold" size={48} />
                <p className="text-gold font-serif text-sm tracking-widest animate-pulse">CARGANDO...</p>
            </div>
        );
    }

    if (error || !membership) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#0a0a0a]">
                <AlertCircle className="text-red-400 mb-4" size={64} />
                <h2 className="text-2xl font-serif font-bold text-white mb-2">¡Oops!</h2>
                <p className="text-zinc-500">{error || 'No pudimos encontrar tu membresía.'}</p>
                <p className="text-zinc-600 text-sm mt-4 italic">Por favor, intenta escanear el código de nuevo.</p>
            </div>
        );
    }

    const slots = Array.from({ length: 10 });
    const isCompleted = membership.current_stamps >= 10 || membership.status === 'completed';

    if (isCompleted) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#0a0a0a]">
                <div className="w-24 h-24 mb-6 rounded-full bg-gold/10 flex items-center justify-center border border-gold/30 animate-pulse">
                    <Star className="text-gold fill-gold" size={48} />
                </div>
                <h2 className="text-2xl font-serif font-bold text-white mb-4 uppercase tracking-widest">
                    Membresía Honoraria
                </h2>
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-gold/20 mb-8 max-w-sm">
                    <p className="text-gold font-bold text-lg mb-2">¡TARJETA COMPLETADA!</p>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        SOLICITA UNA NUEVA MEMBRESÍA EN TU PRÓXIMA VISITA PARA SEGUIR DISFRUTANDO DE NUESTROS BENEFICIOS.
                    </p>
                </div>
                <p className="text-zinc-600 text-xs uppercase tracking-tighter">ID: {membership.qr_code_id}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center p-6 pt-12 space-y-8 bg-[#0a0a0a] overflow-x-hidden transition-colors duration-500">
            {/* Header */}
            <div className="text-center space-y-2 animate-in fade-in slide-in-from-top duration-700">
                <h1 className="text-4xl font-serif gold-gradient font-bold tracking-widest uppercase">
                    Santo Antojo
                </h1>
                <p className="text-zinc-500 tracking-[0.3em] text-xs uppercase font-medium">Membresía Exclusiva</p>
            </div>

            {/* Original Card Interface */}
            <div className="relative w-full max-w-lg aspect-[1.58/1] animate-in zoom-in duration-700 delay-100">
                {/* Background Image */}
                <img
                    src="/card_membership.jpg"
                    alt="Tarjeta Santo Antojo"
                    className="w-full h-full object-cover rounded-xl shadow-2xl shadow-gold/10 border border-gold/20"
                />

                {/* Stamp Slots Overlay - Fine Tuned Centering */}
                <div className="absolute top-[40.8%] left-[39.2%] w-[32.5%] h-[21%] grid grid-cols-5 grid-rows-2">
                    {slots.map((_, index) => (
                        <div
                            key={index}
                            className="relative flex items-center justify-center"
                        >
                            {index < membership.current_stamps && (
                                <div className="flex items-center justify-center animate-in zoom-in duration-500">
                                    <div className="w-[18px] h-[18px] md:w-[24px] md:h-[24px] rounded-full bg-gradient-to-br from-[#D4AF37] via-[#F9E27E] to-[#B8860B] shadow-[0_0_8px_rgba(212,175,55,1)] border border-white/30" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* ID Overlay (Small and discrete) */}
                <div className="absolute bottom-[4%] left-[4%]">
                    <p className="text-[8px] font-mono text-white/30 uppercase tracking-tighter">
                        ID: {membership.qr_code_id.split('/').pop()}
                    </p>
                </div>
            </div>

            {/* Reward & Info */}
            <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom duration-700 delay-300">
                <div className="p-6 rounded-3xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-gold/10 shadow-xl">
                    <h3 className="text-gold font-serif font-bold uppercase tracking-widest text-base mb-2">Tu Próximo Regalo</h3>
                    <p className="text-white text-xl font-serif leading-tight">
                        ¡Colecciona 10 sellos y recibe un combo de hamburguesa gratis!
                    </p>
                </div>

                <div className="px-6 space-y-4">
                    <p className="text-zinc-400 text-sm leading-relaxed italic">
                        "Presenta tu tarjeta de membresía después de una visita al lugar o compra a domicilio para que se haga válido el sello."
                    </p>

                    <div className="flex justify-center items-center gap-4 text-zinc-600">
                        <div className="h-px w-8 bg-zinc-800" />
                        <Star size={16} className="fill-current" />
                        <div className="h-px w-8 bg-zinc-800" />
                    </div>
                </div>
            </div>

            {/* Decorative branding */}
            <div className="mt-auto pb-6 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
                <img src="https://images.unsplash.com/photo-1571091718767-18b5b1457add?q=80&w=2072&auto=format&fit=crop" alt="Burger" className="w-12 h-12 rounded-full object-cover" />
            </div>
        </div>
    );
};

export default MembershipView;
