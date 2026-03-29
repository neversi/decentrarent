import { useEffect, useRef } from 'react';
import { Centrifuge } from 'centrifuge';
import { useAuthStore } from '../../auth/store';

export function useCentrifugo() {
  const clientRef = useRef<Centrifuge | null>(null);
  const { token, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    const client = new Centrifuge('ws://localhost:8000/connection/websocket', {
      token,
    });

    client.connect();
    clientRef.current = client;

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [token, isAuthenticated]);

  return clientRef;
}
