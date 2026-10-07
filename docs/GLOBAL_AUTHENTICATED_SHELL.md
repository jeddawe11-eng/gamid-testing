# Global Notifications on authenticated GamID surfaces — TESTING

## History

`81669c0412bea661a301d552dd1ba18be5520f5f` introduced the reusable global center but wired it only into Account. Play Together (`3f1e78c2aa61a59607187a132c7fbddf7b932c7d`) and Wall Editor (`bb0949ce0f5a2910a4cea85569a758c547b25c42`) already had independent headers. There is no identified later commit removing their bells: they never received the global mount. `5bf24eb7fbce4d16146291fb74c4ed40d539731a` restored Play Together with a local adapter. This change replaces that adapter and Account's local mount with a product-wide lifecycle.

## Audit

| Surface | Previous behavior | Shared-shell behavior |
|---|---|---|
| Account / Your GamID | Mounted after identity load | All signed-in Account states inherit the center |
| Profile, Intro editing/upload, Games/Game Details, Connections, privacy/publishing, QR/sharing | Account sections | Same document/center, no additional subscriptions |
| My Duo management | Account section | Same center; typed destination retains section focus |
| My Crew management + Crew Wall management/mini editor | Account sections | Same center; typed destination retains section focus |
| Play Together: creation, matching, Ready Check, Team Room, history | Page-local adapter | Inherits the center from the authenticated client |
| My Wall / Wall Editor, Templates, Preview, Save/Publish | No center; CSP also lacked the TESTING WebSocket origin | Inherits the center; exact TESTING Realtime origin allowed |
| `/crew/` published Crew Wall and owner-only draft preview | No center | Signed-in top-level visitors/owners get their own center; anonymous visitors do not |
| Public `/@handle` and `/public/` | Visitor navigation | Explicit public surface; no owner notification controls |
| `account/intro-preview.html` | Embedded renderer used by Account and public Intro | No authenticated client; parent supplies state, no extra socket |
| Landing, 404, W0 prototype/lab/view/embed/editor pages | Static or fixture/rendering code | No authenticated client; no owner controls |

## Default architecture

Every top-level page that imports `account/supabase-client.js`, directly or through its entry-module graph, automatically boots `app/authenticated-shell.js`. Future authenticated pages use this client and provide a header; no notification import, host markup, page-specific unread state or subscription setup is necessary. Public visitor-only pages explicitly use `data-gamid-surface="public"`; iframe renderers never boot the shell.

The shell places the existing `notifications/notification-center.js` in the existing header and loads its existing CSS. It owns one lifecycle per document, not a second notification system. The same owner RPCs, server producers, type registry, private notification subscriber, five-second live toast, read and unread contract remain unchanged. Page-specific typed navigation can consume the cancelable `gamid:notification-navigate` event; otherwise the shared registry produces an internal Account link, with canonical Cloudflare routes (generic historical base-path compatibility remains).

Auth changes emit a data-free event from the shared client. Logout/account replacement removes the old center immediately; cross-tab storage changes reconcile through the same client. Pagehide tears down; pageshow restores after back/forward cache navigation. A center destroyed during its initial read cannot later open an orphan subscription. There is no polling, new table, migration, secret or producer.

`scripts/check-authenticated-shell.mjs` runs with lint: it discovers HTML entry-module graphs and rejects missing headers, page-local notification mounts, and a CSP blocking the private TESTING WebSocket. Regression fixtures include a previously unknown future management route. Public pages and embedded renderers are explicitly covered as exclusions.

Wall responsive changes apply only to the header: at narrow widths, the existing action buttons occupy a second toolbar row so the global bell does not cover accepted controls. The editor's existing `--top` layout variable accounts for the row; Wall data, canvas operations, rendering, Templates and persistence are untouched.
