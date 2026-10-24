import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

export type ServerMessage =
  | { type: 'hello'; serverTime: string }
  | { type: 'device_update'; device: unknown }
  | { type: 'event'; event: unknown }
  | { type: 'alert'; alert: unknown }
  | { type: 'armed'; armed: boolean; by: string };

let wss: WebSocketServer | null = null;

export function attachWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    send(socket, { type: 'hello', serverTime: new Date().toISOString() });
  });
}

function send(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

/** Push a message to every connected dashboard. */
export function broadcast(msg: ServerMessage) {
  wss?.clients.forEach((c) => send(c, msg));
}
