// GamID notification types, as the browser presents them. The server decides which notifications exist (public.notification_types, written only by trusted
// server code through private.notify); this registry only turns a row into words and maps its TYPED destination key to an internal place. A destination is never a
// URL: an unknown key simply has no action. A future producer (Play Together, Teams, Tournaments, Verification, Connections ...) adds its types here and on the server.
const HANDLE = /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/;
const who = row => (typeof row?.actor_handle === "string" && HANDLE.test(row.actor_handle) ? `@${row.actor_handle}` : "A GamID");

export const NOTIFICATION_TEXT = Object.freeze({
  // My Duo - the first producer
  "duo.request_received": row => `${who(row)} sent you a Duo request.`,
  "duo.request_cancelled": row => `${who(row)} cancelled their Duo request.`,
  "duo.request_declined": row => `${who(row)} declined your Duo request.`,
  "duo.request_accepted": row => `${who(row)} accepted your Duo request. You're now Duo.`,
  "duo.ended": row => `${who(row)} ended your Duo.`,
  "duo.replaced": row => `Your Duo with ${who(row)} has ended because ${who(row)} chose a new Duo.`,
});

export const notificationText = row => (Object.hasOwn(NOTIFICATION_TEXT, row?.type_key) ? NOTIFICATION_TEXT[row.type_key](row) : "You have a new GamID notification.");

// typed internal destinations: key -> where it lives (the page that owns it decides how to open / focus it)
export const DESTINATIONS = Object.freeze({
  "account.my_duo": { page: "account", anchor: "my-duo", label: "My Duo" },
});
export const destinationOf = row => (typeof row?.destination === "string" && Object.hasOwn(DESTINATIONS, row.destination) ? row.destination : null);
