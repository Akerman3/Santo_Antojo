import { useState, useEffect } from 'react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Camera, CheckCircle, XCircle, Loader2, PartyPopper } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Scan = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [finished, setFinished] = useState(false);
    const navigate = useNavigate();

    // Sound effect generator
    const playBeep = (isBonus = false) => {
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gain = context.createGain();

            oscillator.type = 'sine';
            // Higher frequency for special 10th stamp
            oscillator.frequency.setValueAtTime(isBonus ? 1200 : 1000, context.currentTime);

            oscillator.connect(gain);
            gain.connect(context.destination);

            oscillator.start();
            // Sharp drop for a crisp "beep"
            gain.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + (isBonus ? 0.3 : 0.1));
            oscillator.stop(context.currentTime + (isBonus ? 0.3 : 0.1));
        } catch (e) {
            console.error('Audio error:', e);
        }
    };

    useEffect(() => {
        // Check permissions and auto-start on mount
        const init = async () => {
            try {
                const { camera } = await BarcodeScanner.checkPermissions();
                if (camera !== 'granted') {
                    await BarcodeScanner.requestPermissions();
                }
                // Auto-start scan after a short delay to ensure UI is ready
                setTimeout(startScan, 500);
            } catch (e) {
                console.error('Permission check failed', e);
            }
        };
        init();
    }, []);

    const startScan = async () => {
        setResult(null);
        setError(null);
        setSuccess(false);
        setFinished(false);

        try {
            if (!window.hasOwnProperty('Capacitor')) {
                // Mock scanning for browser development
                setIsScanning(true);
                setTimeout(() => {
                    handleScanResult('SA-B1-024');
                    setIsScanning(false);
                }, 1500);
                return;
            }

            // 1. Ensure permissions (double check)
            const { camera } = await BarcodeScanner.checkPermissions();
            if (camera !== 'granted') {
                const req = await BarcodeScanner.requestPermissions();
                if (req.camera !== 'granted') {
                    setError('Permiso de cámara denegado.');
                    return;
                }
            }

            // 2. Check and Install Google Barcode Scanner Module (Android only)
            const checkModule = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
            if (!checkModule.available) {
                setError('Instalando módulo de escaneo de Google... Por favor, espere y reintente.');
                await BarcodeScanner.installGoogleBarcodeScannerModule();
                return;
            }

            // 3. Start scanning
            const { barcodes } = await BarcodeScanner.scan();
            if (barcodes.length > 0) {
                handleScanResult(barcodes[0].displayValue);
            }
        } catch (e: any) {
            console.error(e);

            // Provide more specific error messages if possible
            if (e.message?.includes('Google Barcode Scanner Module is not available')) {
                setError('El módulo de Google no está listo. Reinténtalo en unos segundos.');
            } else {
                setError('No se pudo abrir la cámara. Asegúrate de estar en un dispositivo móvil.');
            }
        }
    };

    const handleScanResult = async (qrId: string) => {
        // Extract ID from URL if scanned as a full link
        const cleanId = qrId.includes('/') ? qrId.split('/').pop() || qrId : qrId;

        setResult(cleanId);
        setLoading(true);

        try {
            // 1. Validate QR in Supabase
            const { data, error: fetchError } = await supabase
                .from('memberships')
                .select('*')
                .eq('qr_code_id', cleanId)
                .single();

            if (fetchError || !data) {
                setError('Membresía no encontrada o código inválido.');
                setLoading(false);
                return;
            }

            // Check if already completed
            if (data.current_stamps >= 10 || data.status === 'completed') {
                setError('ESTA TARJETA DE MEMBRESÍA YA HA SIDO COMPLETADA, SOLICITA UNA NUEVA MEMBRESÍA');
                setLoading(false);
                return;
            }

            // 2. Add stamp
            const newStamps = data.current_stamps + 1;
            const isDone = newStamps >= 10;
            setFinished(isDone);

            const { error: updateError } = await supabase
                .from('memberships')
                .update({
                    current_stamps: newStamps,
                    last_stamped_at: new Date().toISOString(),
                    status: isDone ? 'completed' : 'active'
                })
                .eq('id', data.id);

            if (updateError) {
                setError('Error al actualizar sellos.');
                setLoading(false);
                return;
            }

            // 3. Log the action
            await supabase.from('stamps_log').insert({
                membership_id: data.id,
                admin_id: (await supabase.auth.getUser()).data.user?.id
            });

            setSuccess(true);
            playBeep(isDone);

            if (isDone) {
                // Special completion message
                setResult('¡MEMBRESÍA COMPLETADA EXITOSAMENTE!');
                // Trigger Vibration for 2 seconds
                try {
                    await Haptics.vibrate({ duration: 2000 });
                } catch (e) {
                    // Fallback to navigator.vibrate if haptics fail
                    if (navigator.vibrate) navigator.vibrate(2000);
                }
            } else {
                // Short impact for normal stamp
                try {
                    await Haptics.impact({ style: ImpactStyle.Heavy });
                } catch (e) { }
            }

            setTimeout(() => {
                navigate('/');
            }, isDone ? 6000 : 3000);

        } catch (e) {
            setError('Ocurrió un error inesperado.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-serif gold-gradient font-bold">Escáner de Membresías</h1>
                <p className="text-zinc-500">Escanea el código QR del cliente para sellar</p>
            </div>

            <div className="relative w-72 h-72">
                {/* Scanner Animation View */}
                <div className={`absolute inset-0 border-2 ${success ? 'border-green-400' : error ? 'border-red-400' : 'border-gold/30'} rounded-3xl overflow-hidden glass-card flex items-center justify-center transition-colors duration-500`}>
                    {!isScanning && !loading && !result && (
                        <Camera className="text-gold/20" size={80} />
                    )}

                    {isScanning && (
                        <div className="w-full h-1 bg-gold/50 absolute top-0 animate-scan" />
                    )}

                    {loading && (
                        <Loader2 className="animate-spin text-gold" size={48} />
                    )}

                    {success && (
                        <div className="text-center animate-in zoom-in p-4">
                            {finished ? (
                                <>
                                    <div className="relative mb-4">
                                        <div className="absolute inset-0 animate-ping bg-gold/20 rounded-full" />
                                        <PartyPopper className="text-gold mx-auto relative z-10" size={80} />
                                    </div>
                                    <p className="text-gold font-bold uppercase tracking-widest text-lg leading-tight">
                                        ¡MEMBRESÍA COMPLETADA EXITOSAMENTE!
                                    </p>
                                    <p className="text-white/60 text-[10px] mt-2 font-mono uppercase">ID: {result}</p>
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="text-green-400 mx-auto mb-2" size={60} />
                                    <p className="text-green-400 font-bold uppercase tracking-widest text-sm">¡Sello Exitoso!</p>
                                    <p className="text-white text-xs mt-1">ID: {result}</p>
                                </>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="text-center animate-in zoom-in p-4">
                            <XCircle className="text-red-400 mx-auto mb-2" size={60} />
                            <p className="text-red-400 font-medium text-sm leading-tight">{error}</p>
                        </div>
                    )}
                </div>

                {/* Decorative Corners */}
                <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-gold rounded-tl-xl" />
                <div className="absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 border-gold rounded-tr-xl" />
                <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 border-gold rounded-bl-xl" />
                <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-gold rounded-br-xl" />
            </div>

            {!isScanning && !loading && !success && (
                <button
                    onClick={startScan}
                    className="btn-gold px-12 py-4 text-xl shadow-gold/20"
                >
                    <Camera size={24} />
                    {error ? 'Reintentar' : 'Escanear Ahora'}
                </button>
            )}

            {isScanning && (
                <p className="text-gold animate-pulse font-medium tracking-wide">
                    Buscando código QR...
                </p>
            )}

            {success && (
                <p className="text-zinc-500 text-sm animate-pulse">
                    Redirigiendo al panel...
                </p>
            )}

            <div className="pt-4">
                <button
                    onClick={() => navigate('/')}
                    className="text-zinc-500 hover:text-white transition-colors text-sm"
                >
                    Cancelar y volver
                </button>
            </div>
        </div>
    );
};

export default Scan;
