import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import AdminDashboard from './views/AdminDashboard';
import Login from './views/Login';
import Scan from './views/Scan';
import MembershipView from './views/MembershipView';
import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

// Basic Error Boundary to prevent black screens
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error('CRASH:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Error de Aplicación</h1>
          <p className="text-zinc-400 mb-8">Algo salió mal al cargar la aplicación. Por favor, intenta recargar.</p>
          <button onClick={() => window.location.reload()} className="btn-gold">Recargar Página</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [session, setSession] = useState<any>(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [hasConfigError, setHasConfigError] = useState(false);

  useEffect(() => {
    // Check if configuration is present
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error('Environment variables missing!');
      setHasConfigError(true);
      setConfigChecked(true);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setConfigChecked(true);
    }).catch(err => {
      console.error('Session check failed:', err);
      setConfigChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!configChecked) return null;

  if (hasConfigError) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Error de Configuración</h1>
        <p className="text-zinc-400 max-w-md">
          Faltan las variables de entorno de Supabase en Vercel.
          Asegúrate de haber configurado <strong>VITE_SUPABASE_URL</strong> y <strong>VITE_SUPABASE_ANON_KEY</strong>.
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <MainLayout session={session}>
          <Routes>
            <Route path="/" element={session ? <AdminDashboard /> : <Navigate to="/login" />} />
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
            <Route path="/scan" element={session ? <Scan /> : <Navigate to="/login" />} />
            <Route path="/membership/:id" element={<MembershipView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
