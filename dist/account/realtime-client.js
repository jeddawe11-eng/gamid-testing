import { PUBLISHABLE_KEY, SUPABASE_PROJECT_ID, restoreSession } from "./supabase-client.js";

const HEARTBEAT_INTERVAL_MS = 20_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

export function subscribePrivateBroadcast({ topic, event, onMessage, WebSocketImpl = globalThis.WebSocket, getSession = restoreSession, setTimer = setTimeout, clearTimer = clearTimeout, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval }) {
  let socket = null, heartbeat = null, reconnect = null, stopped = false, attempts = 0, ref = 0;
  const socketTopic = `realtime:${topic}`;
  const nextRef = () => String(++ref);
  const send = (eventName, payload = {}, joinRef = null, topicName = socketTopic) => {
    if (socket?.readyState !== WebSocketImpl.OPEN) return;
    socket.send(JSON.stringify({ topic: topicName, event: eventName, payload, ref: nextRef(), join_ref: joinRef }));
  };
  const scheduleReconnect = () => {
    if (stopped || reconnect) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempts++, RECONNECT_DELAYS_MS.length - 1)];
    reconnect = setTimer(() => { reconnect = null; connect(); }, delay);
  };
  const connect = async () => {
    if (stopped) return;
    let session;
    try { session = await getSession(); } catch { scheduleReconnect(); return; }
    if (!session?.access_token || stopped) return;
    const url = `wss://${SUPABASE_PROJECT_ID}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`;
    socket = new WebSocketImpl(url);
    socket.addEventListener("open", () => {
      attempts = 0;
      const joinRef = nextRef();
      socket.send(JSON.stringify({ topic: socketTopic, event: "phx_join", payload: { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, postgres_changes: [], private: true }, access_token: session.access_token }, ref: joinRef, join_ref: joinRef }));
      heartbeat = setIntervalImpl(() => send("heartbeat", {}, null, "phoenix"), HEARTBEAT_INTERVAL_MS);
    });
    socket.addEventListener("message", message => {
      let envelope;
      try { envelope = JSON.parse(message.data); } catch { return; }
      if (envelope.topic === socketTopic && envelope.event === "broadcast" && (Array.isArray(event)?event.includes(envelope.payload?.event):envelope.payload?.event === event)) onMessage(envelope.payload.payload,envelope.payload.event);
      if (envelope.topic === socketTopic && envelope.event === "phx_error") socket?.close();
    });
    socket.addEventListener("close", () => { if (heartbeat) clearIntervalImpl(heartbeat); heartbeat = null; scheduleReconnect(); });
    socket.addEventListener("error", () => socket?.close());
  };
  connect();
  return () => {
    stopped = true;
    if (reconnect) clearTimer(reconnect);
    if (heartbeat) clearIntervalImpl(heartbeat);
    if (socket?.readyState === WebSocketImpl.OPEN) send("phx_leave", {}, null);
    socket?.close();
  };
}
