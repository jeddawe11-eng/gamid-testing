# GamID — Friends Wall / Stickers — Discussion & Review Record

**Recorded:** 2026-10-17  
**State:** PRODUCT DISCUSSION / REVIEW ONLY — **NOT IMPLEMENTED**, no authorization to code, migrate, deploy, or change subscriptions.  
**Keywords for future sessions:** sticker, stickers, استيكر, استيكرات, Friends Wall, Friend Drops, Wall slide 3, paid slots.

> This is the durable record of the Friends Wall / Stickers conversation. It preserves explicit decisions, evolving ideas, examples, and open questions. Read `PROJECT_STATE.md` and `gamid-truth.json` for authoritative *implemented* GamID state; this review does not assert that any proposed feature exists.

## 1. Product concept and placement

- Concept: friends leave social, game-themed sticker "drops" on another player's GamID Wall.
- Proposed location: the **third of three Wall slides** as a dedicated **Friends Wall**; first two slides remain owner-controlled. This is a strong product direction discussed and illustrated, **not an implementation contract**. Empty-state behavior and exact slide allocation still require final review.
- Contributor chooses the sticker and its placement, not the Wall owner. Stickers must not overlap each other or the owner's content; concurrent placements need server-side collision/permission validation.
- An early idea of unrestricted friend photo/video uploads was **not approved for launch**. Safer initial direction: curated/preapproved sticker library; custom image/video uploads only after a moderation plan.

## 2. Social sticker content

- Social/game stickers explicitly welcomed, including examples **“GG BRO 🎮”**, **“LEGEND 🔥”**, **“CARRIED ME 😂”**, **“MY DUO ❤️”**.
- Additional game-themed collections, premium/rare/animated/seasonal stickers and game packs are ideas. Do not use unlicensed game artwork/logos.
- Free and paid/premium sticker *types* were discussed. A contributor with premium sticker access may place one on a Free friend's Wall: **sticker catalog entitlement follows the contributor**, not the recipient.
- Exact catalog, ownership model, price, rarity, animation and pack entitlements remain unapproved.

## 3. Attribution and interaction

- Sticker displays without permanently visible author attribution.
- On desktop **hover**, show tooltip with **contributor's profile name and game selected when placing**; on mobile, **tap** equivalent. Name is sourced automatically from profile; contributor selects the game.
- Wall owner may react with emoji or comment. Notify contributor when owner reacts/comments.
- Notify Wall owner immediately when a friend places a sticker, with click-through to the item. Notification controls, batching, and exact UX still need design.
- Both **contributor and Wall owner** can manually remove a sticker. Contributor cannot delete others' stickers.
- On expiration: **permanent deletion**, no archive; associated storage/resources freed.
- Owner control to disable friend contributions or block particular users was recommended, not formally finalized.
- Moving/repositioning after placement, moderation/reporting and visibility rules are still unresolved.

## 4. Sticker count: evolution and current direction

**Earlier baseline:** each player can have **one active free sticker per friend Wall**, independently for each friend. Example: Ahmed can place one at Mohammed's Wall, one at Khaled's, and one at Meshael's. After deletion/expiration, the free slot becomes available again.

**Superseded proposal:** assistant suggested that Ahmed's subscription tier control the number of active stickers he can place at each friend's Wall (illustrative Free 1 / Plus 3 / Pro 5). **Mazen explicitly rejected tying additional sticker count to the subscription. DO NOT treat those counts as approved.**

**Current desired direction:** first active sticker per friend is free; Ahmed can place additional stickers **by paying a small amount per additional sticker or unlocking extra capacity**, independently of his subscription. The specific payment/ownership model remains open.

- Sample price **USD 0.10 per additional sticker** was only an illustration, **not approved**.
- Sample recharge **USD 5 for 50 extra placements** was an illustration, **not approved**.
- Individual micro-card charges may be inefficient due to processing fees; a prepaid in-app balance/credits system was suggested, **not approved**.
- Premium sticker *design* eligibility can still depend on Ahmed's entitlements; that is separate from the number of sticker placements.
- Whether the owner can cap total contributed stickers for space/abuse, and how purchases behave when space is full, must be defined.

## 5. Expiration and owner subscription

- The **duration** of a placed sticker depends on the **recipient/Wall owner's subscription**, not the contributor's subscription.
- Illustrative examples only: owner Free = 3 days; Plus = 14 days; Pro = 30 days. **No exact duration or tier names/values approved.**
- Paid/premium contributor stickers can appear on Free owners' Walls, but follow the Free owner's applicable duration.
- The owner's Wall capacity/placement constraints apply regardless of contributor purchase.
- Existing GamID Truth reports Wall assets 60, videos 15 and storage 200,000,000 bytes at the 2026-10-05 snapshot. **Do not assume friend stickers count against those quotas without architectural review.**

## 6. CRITICAL OPEN COMMERCIAL DECISION — revisit before implementation

**Question Mazen explicitly asked to preserve:**

> If Ahmed wants more than one sticker at Mohammed's Wall, does Ahmed pay **each time he places an additional sticker**, and pay again after expiry? **OR** does Ahmed pay **once for a permanent extra slot at Mohammed's Wall**, which he can reuse after a sticker expires or is deleted?

**Option A — pay per placement:** USD 0.10 per additional placement (illustration only). Sticker expires and is permanently deleted; adding another paid sticker costs again. Revenue can recur; may create friction.

**Option B — permanent extra slot:** USD 0.10 once (illustration only) unlocks one extra reusable active sticker slot **at that specific friend's Wall**. Sticker itself still expires/deletes; purchased capacity persists. More player-friendly; changes monetization economics.

Assistant last leaned toward Option B for user experience, after initially leaning toward A for recurring revenue. **Mazen has NOT chosen either. Do not infer approval from assistant preference.** Determine transferability, refunds, owner blocks, account deletion, expiry of paid entitlement, payment infrastructure and abuse safeguards later.

## 7. Other decisions to resolve before build

- Exact number of free slots and whether “one free active sticker per friend” applies to all relationships (the current working assumption is yes).
- Sticker duration values and when timers start; behavior on subscription upgrade/downgrade.
- Payment mechanics, credit pricing, currency, fees, refunds, fraud/chargebacks, and regulatory requirements.
- Collision, layout, concurrency, resize, layering, mobile interactions, and full-Wall capacity behavior.
- Who can contribute (friends only, approved relationships, privacy settings), report/block tools, rate limits and moderation.
- Premium catalog entitlements, paid sticker permanence, animated stickers and future shop.
- Notification batching/preferences and comments/reactions policy.
- Decide whether third slide is always reserved, and how it interacts with existing Wall editor/public rendering.

## 8. Agreed development approach / scope boundary

Mazen was advised to **lock essential architecture before coding**, but defer commercial numbers, final visual polish and store details. Suggested phases:
1. Base Friends Wall, curated stickers, game selection, hover/tap attribution, permissions, collision checks, delete, notification.
2. Entitlements, owner-based expiry, paid extra capacity and commerce **after resolving Section 6**.
3. Animations, game packs and shop later.

Before any implementation, conduct **read-only technical audit** of current Wall slides, social graph, notifications, subscription structure, storage and GamID Truth. Report conflicts/risks and stage the plan. **This conversation did not authorize implementation.**

## 9. Cross-session continuation instruction

When Mazen says “استيكر” / “استيكرات” / “Friends Wall” in a future GamID conversation, read this review before making assumptions. Preserve the distinction between explicit user direction, assistant proposals, illustrative numbers and unresolved questions. In particular, **do not reintroduce subscription-tier limits on additional sticker count**, and **do not silently decide pay-per-placement versus permanent slot**.

**GamID Truth: NO CHANGE REQUIRED** for this documentation-only discussion: no new capability was implemented/accepted and no existing authoritative product contract changed.
