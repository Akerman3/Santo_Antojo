import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Extra-safe Error Boundary at the root
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('ROOT CRASH:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: 'black',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}>
          <h1 style={{ color: '#ff4444' }}>Error Crítico</h1>
          <p>La aplicación no pudo iniciarse correctamente.</p>
          <pre style={{
            backgroundColor: '#1a1a1a',
            padding: '10px',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: '100%',
            overflow: 'auto',
            color: '#888'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#D4AF37',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

console.log('Main.tsx evaluation started...');

try {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root container not found');

  const root = createRoot(container);
  console.log('React Root created, rendering...');

  root.render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>
  );
  console.log('Initial render call completed');
} catch (err) {
  console.error('FATAL RENDER ERROR:', err);
}
