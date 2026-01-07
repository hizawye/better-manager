import { useState, useEffect, useCallback } from 'react';

interface ServerStatus {
  status: 'ok' | 'error' | 'loading';
  version?: string;
  latency?: number;
  error?: string;
}

const BASE_URL = import.meta.env.DEV ? 'http://localhost:8094' : '';

export function useServerStatus(pollInterval: number = 30000) {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    status: 'loading',
  });

  const checkStatus = useCallback(async () => {
    const startTime = Date.now();
    try {
      const response = await fetch(`${BASE_URL}/health`);
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        setServerStatus({
          status: 'ok',
          version: data.version,
          latency,
        });
      } else {
        setServerStatus({
          status: 'error',
          error: 'Server returned an error',
          latency,
        });
      }
    } catch {
      setServerStatus({
        status: 'error',
        error: 'Cannot connect to server',
      });
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, pollInterval);
    return () => clearInterval(interval);
  }, [checkStatus, pollInterval]);

  return { ...serverStatus, refresh: checkStatus };
}
