import { lazy, Suspense } from 'react';
import { AppProvider } from './state/AppContext.jsx';
import PhoneShell from './components/PhoneShell.jsx';

// Halaman admin (rekap sales) dipisah jadi chunk sendiri - pemilik warung nggak pernah buka, jangan ikut dimuat.
const Admin = lazy(() => import('./screens/Admin.jsx'));

export default function App() {
  if (window.location.pathname.replace(/\/+$/, '') === '/admin') {
    return (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    );
  }
  return (
    <AppProvider>
      <PhoneShell />
    </AppProvider>
  );
}
