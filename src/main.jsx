import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { FeedbackProvider } from './ui/Feedback.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';
import './styles.css';
import './app.css';

// Sesión vencida o revocada: se cierra localmente y las rutas protegidas redirigen al login.
const onError = error => {
  if (['PGRST301', 'PGRST303'].includes(error?.code)) supabase?.auth.signOut({ scope: 'local' });
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
    mutations: { retry: 0 },
  },
});

function MissingConfig() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Configuración pendiente</h1>
        <p>Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Consulta el README.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <FeedbackProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </FeedbackProvider>
        </BrowserRouter>
      </QueryClientProvider>
    ) : <MissingConfig />}
  </StrictMode>,
);
