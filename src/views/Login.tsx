import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Mail, Lock, Loader2 } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { data: { user }, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (loginError || !user) {
            setError('Credenciales inválidas. Por favor intente de nuevo.');
            setLoading(false);
            return;
        }

        // Check if the user is an allowed admin
        const { data: adminCheck, error: checkError } = await supabase
            .from('allowed_admins')
            .select('email')
            .eq('email', user.email)
            .single();

        if (checkError || !adminCheck) {
            await supabase.auth.signOut();
            setError('No tienes permisos de administrador. Contacta al soporte.');
            setLoading(false);
            return;
        }
        // If login is successful and user is an admin, the auth state listener will handle redirection
        // No need to set loading to false here, as the page will reload/redirect
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center">
            <div className="glass-card w-full max-w-md p-8 space-y-8 animate-in zoom-in duration-500">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-serif gold-gradient font-bold">Bienvenido</h1>
                    <p className="text-zinc-400">Acceso exclusivo para administradores</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                            <input
                                type="email"
                                placeholder="Correo electrónico"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-gold/50 transition-colors"
                                required
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                            <input
                                type="password"
                                placeholder="Contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-gold/50 transition-colors"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-red-400 text-sm text-center bg-red-400/10 py-2 rounded-lg border border-red-400/20">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-gold w-full justify-center text-lg"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : 'Entrar'}
                    </button>
                </form>

                <p className="text-center text-zinc-500 text-sm italic">
                    "El sabor prohibido de Santo Antojo"
                </p>
            </div>
        </div>
    );
};

export default Login;
