import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Alert, Device, EventRow, Location } from './types.js';

export type ServerMessage =
  | { type: 'hello'; serverTime: string }
  | { type: 'device_update'; device: Device }
  | { type: 'event'; event: EventRow }
  | { type: 'alert'; alert: Alert }
  | { type: 'alerts_cleared' }
  | { type: 'devices_changed' }
  | { type: 'location'; location: Location }
  | { type: 'open_live_view'; deviceIds: number[] };

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

export const clientCount = () => wss?.clients.size ?? 0;
