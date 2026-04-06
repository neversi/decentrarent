import { StrictMode } from 'react';

if (import.meta.env.DEV) import('./devtools');
import { createRoot } from 'react-dom/client';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
