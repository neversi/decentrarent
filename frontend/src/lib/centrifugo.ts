import { Centrifuge } from 'centrifuge';

let client: Centrifuge | null = null;

export function getCentrifugoClient(token: string): Centrifuge {
  if (client) {
    return client;
  }

  client = new Centrifuge('ws://localhost:8000/connection/websocket', {
    token,
  });

  client.connect();
  return client;
}

export function disconnectCentrifugo() {
  if (client) {
    client.disconnect();
    client = null;
  }
}
