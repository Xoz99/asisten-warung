import { AppProvider } from './state/AppContext.jsx';
import PhoneShell from './components/PhoneShell.jsx';
//claude --resume 61cd98b5-9401-4218-8b69-74e9e65d34d4 --permission-mode auto 
export default function App() {
  return (
    <AppProvider>
      <PhoneShell />
    </AppProvider>
  );
}
