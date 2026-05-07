import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './admin.css';
import { App } from './App';
import { ToastProvider } from './hooks/useToast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
