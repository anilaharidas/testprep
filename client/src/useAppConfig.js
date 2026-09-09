import { useEffect, useState } from 'react';
import { api } from './api.js';

let cache = null;
let inflight = null;

export function useAppConfig() {
  const [cfg, setCfg] = useState(cache);

  useEffect(() => {
    if (cache) return;
    inflight = inflight || api.config();
    inflight.then((c) => {
      cache = c;
      setCfg(c);
    });
  }, []);

  return cfg;
}
