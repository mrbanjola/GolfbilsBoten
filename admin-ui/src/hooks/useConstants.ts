import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Constants } from '../api/types';

let cached: Constants | null = null;
const listeners: Array<(c: Constants) => void> = [];

export function useConstants() {
  const [constants, setConstants] = useState<Constants | null>(cached);

  useEffect(() => {
    if (cached) return;
    api<Constants>('/api/constants').then((c) => {
      cached = c;
      setConstants(c);
      listeners.forEach((fn) => fn(c));
    });
  }, []);

  return constants;
}
