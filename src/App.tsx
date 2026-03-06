import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import { supabase } from './lib/supabase';
import { Loader2, AlertTriangle } from 'lucide-react';

// Lazy load views to isolate potential import crashes
const AdminDashboard = lazy(() => import('./views/AdminDashboard'));
const Login = lazy(() => import('./views/Login'));
const Scan = lazy(() => import('./views/Scan'));
const MembershipView = lazy(() => import('./views/MembershipView'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
    <Loader2 className="animate-spin text-gold mb-4" size={48} />
    <p className="text-gold font-serif text-sm tracking-widest animate-pulse uppercase">Cargando Módulo...</p>
  </div>
);

function App() {
  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [hasConfigError, setHasConfigError] = useState(false);

  useEffect(() => {
    console.log('App Initializing...');

    // 1. Check if configuration is present
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error('Environment variables missing!');
      setHasConfigError(true);
      setInitialized(true);
      return;
    }

    // 2. Init Auth
    const initAuth = async () => {
      try {
        console.log('Checking session...');
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        console.log('Session check complete:', !!initialSession);
        setSession(initialSession);
      } catch (err) {
        console.error('Session check failed:', err);
      } finally {
        setInitialized(true);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, !!session);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!initialized) return <LoadingFallback />;

  if (hasConfigError) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="text-red-500 mb-4" size={64} />
        <h1 className="text-2xl font-bold text-red-500 mb-4">Error de Configuración</h1>
        <p className="text-zinc-400 max-w-md">
          Faltan las variables de entorno de Supabase en Vercel.
          Asegúrate de haber configurado <strong>VITE_SUPABASE_URL</strong> y <strong>VITE_SUPABASE_ANON_KEY</strong>.
        </p>
        <button onClick={() => window.location.reload()} className="btn-gold mt-6">Cargar de Nuevo</button>
      </div>
    );
  }

  return (
    <Router>
      <MainLayout session={session}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={session ? <AdminDashboard /> : <Navigate to="/login" />} />
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
            <Route path="/scan" element={session ? <Scan /> : <Navigate to="/login" />} />
            <Route path="/membership/:id" element={<MembershipView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MainLayout>
    </Router>
  );
}

export default App;
