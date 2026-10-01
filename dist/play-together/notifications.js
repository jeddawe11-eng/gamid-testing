const ids = items => new Set((items || []).map(item => item.request_id || item.session_id || item.member_id));

export function playTogetherAttentionEvents(previous, next) {
  if (!previous || !next) return [];
  const events = [];
  const oldInvites = ids([...(previous.invitations || []), ...(previous.host_invitations || [])]);
  for (const item of [...(next.invitations || []), ...(next.host_invitations || [])]) {
    const id = item.request_id || item.session_id;
    if (!oldInvites.has(id)) events.push({ key: `invite:${id}`, kind: "INVITATION", message: `New squad invitation from @${item.owner_handle}.`, target: "invitationPanel" });
  }
  const oldRequests = ids(previous.incoming_requests);
  for (const item of next.incoming_requests || []) if (!oldRequests.has(item.request_id)) events.push({ key: `request:${item.request_id}`, kind: "REQUEST", message: `@${item.owner_handle} requested to join your squad.`, target: "requestSection" });
  const before = previous.active_session, after = next.active_session;
  if (after && before?.status !== after.status) {
    const messages = { READY_CHECK: "Ready Check started. Respond now.", ROOM_OPEN: "Everyone is ready. Team Room is open.", IN_PLAY: "Play has started.", COMPLETED: "The session was completed.", CANCELLED: "The session was cancelled.", EXPIRED: "The session expired." };
    if (messages[after.status]) events.push({ key: `session:${after.session_id}:${after.status}`, kind: after.status, message: messages[after.status], target: after.status === "READY_CHECK" ? "readySection" : "activePanel" });
  }
  if (before && !after) {
    const terminal = (next.history || []).find(item => item.session_id === before.session_id);
    const messages = { COMPLETED: "The session was completed.", CANCELLED: "The session was cancelled.", EXPIRED: "The session expired." };
    if (messages[terminal?.status]) events.push({ key: `session:${before.session_id}:${terminal.status}`, kind: terminal.status, message: messages[terminal.status], target: "historyPanel" });
  }
  const oldReady = new Map((previous.ready_responses || []).map(item => [item.member_id, item.response]));
  for (const item of next.ready_responses || []) if (oldReady.has(item.member_id) && oldReady.get(item.member_id) !== item.response) events.push({ key: `ready:${item.member_id}:${item.response}`, kind: "READY_RESPONSE", message: `${item.display_name || item.guest_name || "A squad member"}: ${String(item.response).replaceAll("_", " ")}.`, target: "readySection" });
  const oldVoice = new Map((previous.team_room?.participants || []).map(item => [item.member_id, item.voice_state]));
  for (const item of next.team_room?.participants || []) if (oldVoice.has(item.member_id) && oldVoice.get(item.member_id) !== item.voice_state && ["READY","CONNECTED","FAILED"].includes(item.voice_state)) events.push({ key: `voice:${item.member_id}:${item.voice_state}`, kind: "VOICE", message: `${item.display_name || item.handle || "A squad member"}: voice ${item.voice_state.toLowerCase()}.`, target: "roomSection" });
  return events;
}

export function latestHistory(dashboard, limit = 5) {
  return [...(dashboard?.history || [])].sort((a, b) => new Date(b.ended_at || b.formed_at || 0) - new Date(a.ended_at || a.formed_at || 0)).slice(0, limit);
}
