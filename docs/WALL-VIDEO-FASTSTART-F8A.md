# F8-A: fast-start MP4 Wall video uploads, lossless (TESTING, FUNCTIONALLY ACCEPTED 2026-10-21)

> **2026-10-21:** FUNCTIONALLY ACCEPTED by Mazen, for new uploads only:
> - functional correctness and playback: accepted;
> - the local first-frame improvement: measured, not a guarantee;
> - a repeat-visit bandwidth reduction: NOT PROVEN (the final benchmark saw a throttled refetch of a fast-start 4K file);
> - the existing-files migration below: NOT APPROVED.
>
> See Truth `wall-video-faststart`, Product Memory REV-0022 and `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md`. The text below is the delivery record.

Mazen's task "GAMID — SAFE WALL + INTRO BANDWIDTH OPTIMIZATION" (2026-10-21) authorizes the single-copy lossless faststart direction (research `docs/WALL-BANDWIDTH-PHASE2-RESEARCH.md` §2, option A), within these limits:
- no re-encode, no lost audio, no infrastructure change;
- no bulk rewrite of existing files without a separately approved migration plan.

**Delivery:**
- product `51e397259ec6487c4fe5cb63597e40d8399cedf8`, Truth `5600d06`;
- deployed head `5600d0677c5f68a4b9a81c418d644173dfeaf662` (run `39492020998`);
- the served `account/mp4-faststart.js` and `account/supabase-client.js` are byte-identical to the commit.

## What changed

`dist/account/mp4-faststart.js`, called from `uploadWallVideo` (`dist/account/supabase-client.js`), the one upload path of both the desktop and the mobile Wall editors. When the owner adds a **new** MP4 whose `moov` comes after its `mdat`:

1. **The candidate:**
   - the browser moves the `moov` box in front of the first `mdat`;
   - it adds the moved box's size to each stco / co64 chunk offset that points behind the insertion point;
   - nothing else changes: no packet, track, metadata box or size, and audio is kept.
2. **The verification is independent, from the candidate's own bytes:**
   - the top-level layout is the original's, with the moov moved;
   - every chunk of every track, located through the candidate's own tables, has the same length and the same bytes as the original's;
   - every moov byte outside the offset entries is unchanged;
   - every byte outside the moov is the original's.
3. **Only those verified bytes are uploaded:** a Blob of the verified copy (memory only, as the Intro upload already does). It uses the same resumable upload, the same new `<uid>/<uuid>.mp4` path and the same size, so the quota reservation and Global Usage are unchanged. The server's `wall-asset-register` checks are untouched.
4. **Uploaded exactly as chosen:**
   - any MP4 already fast start;
   - any WebM;
   - every file the code cannot prove safe: fragmented (`mvex` / `moof` / `sidx`), encrypted (`senc` / `saio` / `saiz`), media in another file (a non-self-contained `dref`), item locations (`iloc`), `stz2`, an unknown top-level box, inconsistent sample tables, a chunk outside the media or across the old moov, a moov over 8 MiB, a read error.

**Never touched:** existing stored files, the visitor page, leases, F3 / F6-A, publication rules, HEVC conversion (codec-agnostic remux; HEVC is still refused while conversion is off).

**Why in the browser:**
- **Cloud Run:** it can't be deployed from this machine.
- **Edge Function:** a 50 MiB download and re-upload would risk its limits.
- **The browser** already holds the original, so the server never has to overwrite anything.

## Checks (development; not the final benchmark)

**Unit tests** (`tests/wall-video-faststart-f8a.test.js`, 5): they build MP4s by hand.
- Two tracks, stco and co64.
- Already-fast-start and WebM pass-through.
- Seven unsafe kinds uploaded unchanged; truncated / oversized / null input.
- Offsets outside the media and chunks across the moov.
- 300 fuzz rounds: random damage never throws and never yields a candidate that fails stream identity.

**Full suite:** 2079 tests, 2078 pass, 0 fail, 1 skipped (pre-existing). Lint and typecheck pass.

**Real files** (local only, never committed):
- 10 files: ffmpeg fixtures (moov at end, already fast start, fragmented, 3 tracks with metadata and a language tag, HEVC, an edit list, a 40 MB 1080p60 file) and copies of @black's published MP4s, captured earlier as an anonymous visitor.
- For every file: `ffmpeg -f streamhash` (SHA-256 of every packet of every stream) is **identical** before / after. `ffprobe` format + stream metadata is identical, the size is identical, and moov comes before mdat when changed.
- **The server's own inspector** (`inspectMp4` + `videoProblem`) gives the same verdict, codec and size for every original and candidate.
- **In Chrome:** the remux produces output byte-identical to Node's. Both versions play, advance and seek to the end, with the same duration and size.
- **Live:** the deployed module, imported on the TESTING origin, gives the same bytes as the locally verified candidates; 0 page errors.
- **Timing:** about 25–60 ms for the 4.7–9.8 MB files; 160 ms for 40 MB.

**Measured (local Chrome, Range server):**

| File | First frame, original → fast start (no cache) | Requests | First-view bytes |
|---|---|---|---|
| 9.8 MB | 430 → 269 ms (9 Mbps); 144 → 82 ms (50 Mbps) | 3 → 1 | the same: the browser keeps buffering either way |
| 4.7 MB | 413 → 262 ms; 162 → 117 ms | 3 → 1 | the same |

**Measured vs estimate:**
- **Bytes:** F8-A does **not** reduce first-view bytes.
- **Revisits:** its byte saving is on revisits. The TESTING baseline saw Chrome's media cache fail on a moov-at-end file (`ERR_CACHE_OPERATION_NOT_SUPPORTED`) and re-download it: 5.80 MB in 1 of 2 mobile revisits. That intermittent failure did not reproduce locally (both versions revisited from cache), so **the revisit saving is still an estimate**, to be confirmed in the final TESTING benchmark.
- **Which files benefit:** only Walls with new uploads. @black's two moov-at-end MP4s stay as they are until the migration below is approved.

**Costs:** none. No new storage, no copy, no server CPU, no infrastructure. The owner's browser spends a few tens of ms and holds one extra copy of the file in memory (≤ 50 MiB) during upload.

**Security:**
- no new network call; no data leaves the browser except the same upload;
- nothing is logged;
- the server still validates the stored bytes;
- a hostile file can at most make the remux refuse, and is then uploaded unchanged for the server to judge.

## Existing files: proposed migration plan (NOT implemented; needs Mazen's separate approval)

The visitor manifest (`get_public_wall`) and the read policy (`wall_object_is_published`) both use `wall_assets.storage_path` **live**; there is no stored path snapshot. A safe migration therefore never overwrites an object:

1. **Pick candidates (service role, an operator run):** `wall_assets` MP4 rows in `wall-video`. Read only the box headers; skip files that are already fast start and every `.h264.mp4` derivative.
2. **Download and remux** with the same module, then verify with the module **and** `ffmpeg -f streamhash`. Any doubt: skip.
3. **Upload the copy to a NEW path** `<uid>/<new uuid>.mp4`. No object is ever overwritten, so a browser or CDN can never mix byte ranges of the old and the new layout.
4. **Switch in one transaction:** `update wall_assets set storage_path = new, byte_size = same where asset_id = … and storage_path = old` (the compare-and-set refuses if the owner deleted or replaced it meanwhile; the new object is then deleted).
   - Asset id, ownership, draft and publication references are unchanged.
   - The next visitor manifest lists the new path, so F6-A drops the old URL and signs once.
5. **Keep the old object for at least 6 h + margin,** so already issued leases keep serving consistent old bytes, then delete it. Deletion uses the existing gateway, and is retried and idempotent: it deletes only a path no row references.

**Decisions this plan needs:**
- **The temporary double count:** the old object counts in Global Usage for about 6 h. Options: skip owners without headroom, or exclude superseded objects.
- **Where it runs:** a one-off operator run from this machine with the service role, or the worker once Google Cloud access exists.
- **Whether any orphan cleanup** could delete the old object early (it must not).
- **Owner consent:** notify owners, or treat it as an invisible lossless re-layout?

**Expected effect for @black:**
- two files (9.8 + 4.7 MB) become fast start;
- first frame about 40% sooner;
- the revisit cache failure (up to the file size per affected revisit) should disappear.

## Other Wall + Intro items reviewed under this task

None qualified as a low-risk, within-contract change beyond F7-A, F7-C and F8-A, so nothing else was implemented. Waiting for approval (research §5):

| Item | Why it waits |
|---|---|
| F7-B picture display copies | storage policy, or lossy quality |
| Avatar display copies | the accepted avatar pipeline; storage |
| F8-B renditions | lossy |
| F6-B Intro reuse | Cloudflare terms / R2 infrastructure / Intro contract; the original Worker-streaming plan stays rejected |
| JS bundling or immutable URLs | build / infrastructure |
| Stripping the unused AAC track | removes audio; excluded by this task |

Fonts, fire / text effects, posters, CSS, API calls and embeds are already small or procedural (research §1).

**GamID Truth: UPDATED** (new `wall-video-faststart` PENDING_ACCEPTANCE at `51e3972`).
