import { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import './style.css';

const traceEnabled = import.meta.env.VITE_GAME_TRACE === 'true';
const TraceRoute = lazy(() => import('./trace/trace-route'));
const accountRoutes = ['login'];

function GameRoute() {
  useEffect(() => {
    void import('./main');
  }, []);
  return <Outlet />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GameRoute />}>
          <Route index />
          {accountRoutes.map((path) => <Route key={path} path={path} />)}
        </Route>
        <Route
          path="/trace"
          element={
            traceEnabled ? (
              <Suspense fallback={<p className="trace-route-loading" role="status">Caricamento visualizzatore…</p>}>
                <TraceRoute />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const root = document.getElementById('react-root');
if (!root) throw new Error('Contenitore React non trovato.');
createRoot(root).render(<AppRoutes />);
