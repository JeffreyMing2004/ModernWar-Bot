import WebSocket from 'ws';
import { getAccessToken } from './token';
import { config } from './config';
import { handleDispatch } from './handlers';
import { sessionId, setSessionId, sequence, setSequence } from './session';

const GATEWAY_URL = 'wss://api.bot.qq.com/websocket';

// Intents mask (bit positions as per docs)
const INTENT_MAP: Record<string, number> = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  DIRECT_MESSAGE: 1 << 12,
  GROUP_AND_C2C_EVENT: 1 << 25,
  GROUP_AT_MESSAGE_CREATE: 1 << 25,
  GROUP_MESSAGE_CREATE: 1 << 25,
  C2C_MESSAGE_CREATE: 1 << 25,
  INTERACTION: 1 << 26,
  MESSAGE_AUDIT: 1 << 27,
  FORUMS_EVENT: 1 << 28,
  AUDIO_ACTION: 1 << 29,
  PUBLIC_GUILD_MESSAGES: 1 << 30,
};

const requestedIntents = config.intents.reduce(
  (mask, name) => mask | (INTENT_MAP[name] ?? 0),
  0
);

let heartbeatTimer: NodeJS.Timeout | null = null;
let ws: WebSocket | null = null;
let reconnectAttempts = 0;

export function startGateway(): void {
  connect();
}

function connect(): void {
  console.log(`[Gateway] Connecting to ${GATEWAY_URL}...`);

  ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    console.log('[Gateway] Connected');
  });

  ws.on('message', async (data) => {
    let payload: any;
    try {
      payload = JSON.parse(data.toString());
    } catch (e) {
      console.error('[Gateway] Failed to parse message:', e);
      return;
    }

    if (typeof payload.s === 'number') {
      setSequence(payload.s);
    }

    switch (payload.op) {
      case 10: // Hello - heartbeat interval
        startHeartbeat(payload.d.heartbeat_interval);
        if (sessionId) {
          sendResume();
        } else {
          sendIdentify();
        }
        break;
      case 11: // Heartbeat ACK
        break;
      case 7: // Reconnect
        console.log('[Gateway] Server requested reconnect');
        reconnect();
        break;
      case 9: // Invalid Session
        console.log('[Gateway] Invalid session, will re-identify');
        setSessionId(null);
        sendIdentify();
        break;
      case 0: // Dispatch
        if (payload.t === 'READY') {
          setSessionId(payload.d.session_id);
        }
        handleDispatch(payload);
        break;
      default:
        break;
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Gateway] Closed (${code}): ${reason}`);
    stopHeartbeat();
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[Gateway] Error:', err.message);
  });
}

async function sendIdentify(): Promise<void> {
  const token = await getAccessToken();
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: `QQBot ${token}`,
        intents: requestedIntents,
        shard: [0, 1],
        properties: {
          $os: process.platform,
          $browser: 'modernwar-bot',
          $device: 'modernwar-bot',
        },
      },
    })
  );
  console.log('[Gateway] Identify sent');
}

async function sendResume(): Promise<void> {
  const token = await getAccessToken();
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      op: 6,
      d: {
        token: `QQBot ${token}`,
        session_id: sessionId,
        seq: sequence,
      },
    })
  );
  console.log('[Gateway] Resume sent');
}

function startHeartbeat(interval: number): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 1, d: sequence }));
    }
  }, interval);
  console.log(`[Gateway] Heartbeat started (interval ${interval}ms)`);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function reconnect(): void {
  if (ws) {
    try {
      ws.close();
    } catch (e) {
      // ignore
    }
  }
}

function scheduleReconnect(): void {
  reconnectAttempts++;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  console.log(`[Gateway] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(() => {
    connect();
  }, delay);
}
