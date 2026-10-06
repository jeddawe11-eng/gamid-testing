// GamID notification types, as the browser presents them. The server decides which notifications exist (public.notification_types, written only by trusted
// server code through private.notify); this registry only turns a row into words and maps its TYPED destination key to an internal place. A destination is never a
// URL: an unknown key simply has no action. A future producer (Play Together, Teams, Tournaments, Verification, Connections ...) adds its types here and on the server.
const HANDLE = /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/;
const who = row => (typeof row?.actor_handle === "string" && HANDLE.test(row.actor_handle) ? `@${row.actor_handle}` : "A GamID");
const plain = (value, max) => (typeof value === "string" && value.trim() && !/[<>\u0000-\u001f]/.test(value) ? value.trim().slice(0, max) : "");
const crew = row => plain(row?.context?.crew_name, 40) || "your Crew";
const game = row => (plain(row?.context?.game_name, 120) ? ` (${plain(row.context.game_name, 120)})` : "");
const queue = row => (plain(row?.context?.queue_name, 120) ? ` (${plain(row.context.queue_name, 120)})` : "");

export const NOTIFICATION_TEXT = Object.freeze({
  // My Duo - the first producer
  "duo.request_received": row => `${who(row)} sent you a Duo request.`,
  "duo.request_cancelled": row => `${who(row)} cancelled their Duo request.`,
  "duo.request_declined": row => `${who(row)} declined your Duo request.`,
  "duo.request_accepted": row => `${who(row)} accepted your Duo request. You're now Duo.`,
  "duo.ended": row => `${who(row)} ended your Duo.`,
  "duo.replaced": row => `Your Duo with ${who(row)} has ended because ${who(row)} chose a new Duo.`,
  // My Crew - the Crew name / game come from the notification's server-written context (captured at the event, so they still read after a Crew is deleted)
  "crew.invite_received": row => `${who(row)} invited you to join ${crew(row)}${game(row)}.`,
  "crew.invite_cancelled": row => `${who(row)} cancelled your invitation to ${crew(row)}.`,
  "crew.invite_declined": row => `${who(row)} declined your invitation to ${crew(row)}.`,
  "crew.invite_accepted": row => `${who(row)} joined ${crew(row)}.`,
  "crew.member_removed": row => `${who(row)} removed you from ${crew(row)}.`,
  "crew.member_left": row => `${who(row)} left ${crew(row)}.`,
  "crew.deleted": row => `${who(row)} deleted ${crew(row)}.`,
  // Play Together - the three approved contracts (pt.join-request-notifies-host, pt.approve- / pt.reject-notifies-requester); the queue name is server-written context
  "play_together.request_received": row => `${who(row)} requested to join your Play Together squad${queue(row)}.`,
  "play_together.request_approved": row => `${who(row)} approved your request to join their Play Together squad${queue(row)}.`,
  "play_together.request_rejected": row => `${who(row)} declined your request to join their Play Together squad${queue(row)}.`,
});

export const notificationText = row => (Object.hasOwn(NOTIFICATION_TEXT, row?.type_key) ? NOTIFICATION_TEXT[row.type_key](row) : "You have a new GamID notification.");

// typed internal destinations: key -> where it lives (the page that owns it decides how to open / focus it)
export const DESTINATIONS = Object.freeze({
  "account.my_duo": { page: "account", anchor: "my-duo", label: "My Duo" },
  "account.my_crew": { page: "account", anchor: "my-crew", label: "My Crew" },
  "play_together.requests": { page: "play-together", anchor: "requestSection", label: "Play Together" },
  "play_together.session": { page: "play-together", anchor: "activePanel", label: "Play Together" },
});
export const destinationOf = row => (typeof row?.destination === "string" && Object.hasOwn(DESTINATIONS, row.destination) ? row.destination : null);
