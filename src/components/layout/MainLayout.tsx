import React from 'react';
import { Home, QrCode, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface MainLayoutProps {
    children: React.ReactNode;
    session: any;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, session }) => {
    const location = useLocation();

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    const navItems = [
        { icon: Home, label: 'Inicio', path: '/' },
        { icon: QrCode, label: 'Escanear', path: '/scan' },
    ];

    // For the customer membership view, we might not want the sidebar/nav
    const isPublicView = location.pathname.startsWith('/membership/');

    if (isPublicView) {
        return <div className="min-h-screen bg-[#0a0a0a]">{children}</div>;
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col md:flex-row">
            {/* Sidebar for Desktop / Bottom Nav for Mobile */}
            {session && (
                <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#141414]/80 backdrop-blur-md border-t border-gold/20 md:relative md:w-64 md:border-t-0 md:border-r md:bg-[#0f0f0f]">
                    <div className="flex justify-around items-center h-16 md:flex-col md:h-full md:py-8 md:justify-start md:gap-8">
                        <div className="hidden md:block mb-10 px-6">
                            <h1 className="text-2xl font-serif gold-gradient font-bold tracking-wider">
                                SANTO ANTOJO
                            </h1>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">Membresías Premium</p>
                        </div>

                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex flex-col md:flex-row items-center gap-1 md:gap-4 md:w-full md:px-6 py-2 transition-colors ${location.pathname === item.path ? 'text-[#D4AF37]' : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <item.icon size={24} />
                                <span className="text-[10px] md:text-sm font-medium">{item.label}</span>
                            </Link>
                        ))}

                        <button
                            onClick={handleLogout}
                            className="flex flex-col md:flex-row items-center gap-1 md:gap-4 md:w-full md:px-6 py-2 text-zinc-500 hover:text-red-400 mt-auto md:mb-8 transition-colors"
                        >
                            <LogOut size={24} />
                            <span className="text-[10px] md:text-sm font-medium">Salir</span>
                        </button>
                    </div>
                </nav>
            )}

            <main className={`flex-1 overflow-auto ${session ? 'pb-20 md:pb-0' : ''}`}>
                <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in duration-500">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
