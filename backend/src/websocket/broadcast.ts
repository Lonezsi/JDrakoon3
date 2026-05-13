import { Server } from 'ws';
import logger from '../utils/logger';

let wss: Server | null = null;

export function setWss(server: Server) {
  wss = server;
}

export function broadcast(type: string, payload: any) {
  if (!wss) return;
  const message = JSON.stringify({ type, ...payload });
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
