import { AppProvider } from './state/AppContext.jsx';
import PhoneShell from './components/PhoneShell.jsx';

export default function App() {
  return (
    <AppProvider>
      <PhoneShell />
    </AppProvider>
  );
}
