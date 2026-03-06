import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import AdminDashboard from './views/AdminDashboard';
import Login from './views/Login';
import Scan from './views/Scan';
import MembershipView from './views/MembershipView';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

function App() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
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
  );
}

export default App;
