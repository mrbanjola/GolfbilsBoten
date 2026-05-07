import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastFn = (msg: string) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(message);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 2800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast${visible ? ' show' : ''}`}>{msg}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
