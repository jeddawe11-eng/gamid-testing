// Host-only room transitions. Capture the displayed session before awaiting anything;
// a Realtime dashboard replacement must never retarget an in-flight click.
export function roomActionAllowed(dashboard, action) {
  const session = dashboard?.active_session;
  if (!session?.session_id || session.creator_entity_id !== dashboard?.my_entity?.entity_id) return false;
  const state = dashboard.room?.room_status;
  return action === "START" ? state === "OPEN" : action === "COMPLETE" && ["OPEN", "IN_PLAY"].includes(state);
}

export function createRoomActions({ getDashboard, rpc, refresh, message, displayError, onChange = () => {} }) {
  let pending = false;
  const completed = new Set();
  return {
    get pending() { return pending; },
    async run(action, displayedSessionId) {
      const dashboard = getDashboard();
      if (pending || !roomActionAllowed(dashboard, action)) return;
      const sessionId = dashboard.active_session.session_id;
      if (sessionId !== displayedSessionId || completed.has(sessionId)) return;
      pending = true;
      onChange();
      try {
        await rpc("advance_play_together_room", { candidate_session_id: sessionId, candidate_action: action });
        if (action === "COMPLETE") completed.add(sessionId);
        await refresh();
        message(action === "START" ? "Play started." : "Session completed and saved to history.", true);
      } catch (error) {
        message(displayError(error));
      } finally {
        pending = false;
        onChange();
      }
    },
  };
}

// Action-driven refreshes and Realtime invalidations share this queue. The older
// read/render finishes first, then completion fetches the authoritative terminal state.
export function serializeRefresh(refresh) {
  let chain = Promise.resolve();
  return () => {
    const next = chain.then(refresh);
    chain = next.catch(() => {});
    return next;
  };
}
