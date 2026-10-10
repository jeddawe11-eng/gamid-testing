// Classic Profile redesign (DEC-0005, Phases 2-3): the Banner / About Me editor rules and the desktop profile wiring. Browser rendering, crop interaction and
// the responsive layout are exercised by scripts/public-desktop-browser.mjs and scripts/profile-editor-browser.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sniffImageType, checkBannerFile, checkBannerDimensions, coverScale, clampCrop, centeredCrop, zoomCrop, sourceRect, BANNER_OUTPUT, BANNER_SOURCE_MAX_BYTES, BANNER_ACCEPT, BANNER_SERVER_MESSAGES } from "../dist/account/banner-editor.js";
import { normalizeLocation, validateAbout, ABOUT_LIMITS } from "../dist/account/about-editor.js";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const bytes = (...parts) => new Uint8Array(parts.flatMap(p => typeof p === "string" ? [...p].map(c => c.charCodeAt(0)) : p));
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0]), PNG = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]), WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "), GIF = bytes("GIF89a"), AVIF = bytes([0, 0, 0, 0x1c], "ftypavif");

test("Banner source: the real format from the bytes (JPEG, PNG, WebP, GIF, AVIF), 5 MiB max, a contradicting declared type is refused", () => {
  assert.deepEqual([JPEG, PNG, WEBP, GIF, AVIF].map(sniffImageType), ["jpeg", "png", "webp", "gif", "avif"]);
  for (const bad of [bytes("<svg"), bytes("<html>"), bytes([0, 0, 0, 0x18], "ftypmp42"), bytes("BM"), new Uint8Array()]) assert.equal(sniffImageType(bad), null);
  assert.deepEqual(checkBannerFile({ size: BANNER_SOURCE_MAX_BYTES, type: "image/png" }, PNG), { ok: true, kind: "png" });
  assert.deepEqual(checkBannerFile({ size: BANNER_SOURCE_MAX_BYTES + 1, type: "image/png" }, PNG), { ok: false, code: "TOO_LARGE" });
  assert.deepEqual(checkBannerFile({ size: 10, type: "image/png" }, JPEG), { ok: false, code: "UNSUPPORTED" }, "declared PNG, really JPEG");
  assert.deepEqual(checkBannerFile({ size: 10, type: "image/svg+xml" }, bytes("<svg")), { ok: false, code: "UNSUPPORTED" });
  assert.deepEqual(checkBannerFile({ size: 10, type: "" }, GIF), { ok: true, kind: "gif" }, "a missing declared type falls back to the bytes");
  assert.deepEqual(checkBannerFile({ size: 0, type: "image/jpeg" }, JPEG), { ok: false, code: "UNREADABLE" });
  assert.equal(BANNER_SOURCE_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(BANNER_ACCEPT, "image/jpeg,image/png,image/webp,image/gif,image/avif");
  assert.deepEqual(checkBannerDimensions(8193, 100), { ok: false, code: "TOO_BIG_DIMENSIONS" });
  assert.deepEqual(checkBannerDimensions(8000, 8000), { ok: false, code: "TOO_BIG_DIMENSIONS" }, "64 MP is over the 40 MP decode limit");
  assert.deepEqual(checkBannerDimensions(1000, 180), { ok: true, small: true });
  assert.deepEqual(checkBannerDimensions(3000, 1000), { ok: true, small: false });
  assert.match(BANNER_SERVER_MESSAGES.BANNER_CHANGED, /another tab or device/);
});

test("Banner crop: always covers the 1920x320 frame, zoom 1-4 around the frame center, and the source rectangle stays inside the image", () => {
  assert.deepEqual(BANNER_OUTPUT, { width: 1920, height: 320, type: "image/jpeg", quality: 0.9 });
  for (const size of [{ width: 4000, height: 1000 }, { width: 1000, height: 3000 }, { width: 1920, height: 320 }, { width: 640, height: 480 }]) {
    const c = centeredCrop(size);
    assert.equal(c.scale, coverScale(size.width, size.height));
    assert.ok(size.width * c.scale >= 1920 - 1e-6 && size.height * c.scale >= 320 - 1e-6, "covers");
    for (const zoom of [1, 2.5, 4, 9]) {
      const z = zoomCrop(size, c, zoom);
      assert.ok(z.zoom <= 4 && z.zoom >= 1);
      const r = sourceRect(z);
      assert.ok(r.sx >= -1e-6 && r.sy >= -1e-6 && r.sx + r.sw <= size.width + 1e-6 && r.sy + r.sh <= size.height + 1e-6, `${JSON.stringify(size)} zoom ${zoom}`);
      assert.ok(Math.abs(r.sw / r.sh - 6) < 1e-6, "always 6:1");
    }
    const far = clampCrop(size, { zoom: 2, x: 99999, y: -99999 });
    assert.equal(far.x, 0); assert.ok(far.y >= 320 - size.height * far.scale - 1e-6);
  }
});

test("About Me rules match the server's: Location text only, at most 5 + 5, switches only with a value", () => {
  assert.deepEqual(normalizeLocation("  Riyadh,   Saudi Arabia "), { ok: true, value: "Riyadh, Saudi Arabia" });
  assert.deepEqual(normalizeLocation("   "), { ok: true, value: null });
  for (const bad of ["x".repeat(61), "https://a.b", "www.x.com", "<b>x</b>", "a\nb", "a{b}"]) assert.deepEqual(normalizeLocation(bad), { ok: false, code: "INVALID_ABOUT_LOCATION" }, bad);
  assert.deepEqual(ABOUT_LIMITS, { location: 60, languages: 5, genres: 5 });
  const catalogs = { languages: ["ar", "en", "fr", "es", "de", "it"].map(code => ({ code })), genres: ["rpg", "fps"].map(key => ({ key })) };
  assert.equal(validateAbout({ languages: ["ar", "en", "fr", "es", "de", "it"] }, catalogs).code, "TOO_MANY_LANGUAGES");
  assert.equal(validateAbout({ genres: ["mmo"] }, catalogs).code, "INVALID_GENRE");
  assert.deepEqual(validateAbout({ location: "", languages: ["ar"], genres: [], showLocation: true, showLanguages: true, showGenres: true }, catalogs).value, { location: null, languages: ["ar"], genres: [], showLocation: false, showLanguages: true, showGenres: false });
});

test("Profile Editor: Banner and About Me are their own sections with Save Changes / Save All; nothing is saved before Save Changes", () => {
  const html = read("dist/account/index.html"), editor = read("dist/account/profile-editor.js"), account = read("dist/account/account.js"), banner = read("dist/account/banner-editor.js"), aboutJs = read("dist/account/about-editor.js");
  assert.match(html, /<section id="bannerSection" class="connections-section banner-section" aria-label="Banner"><div id="bannerSlot"><\/div><\/section>/);
  assert.match(html, /<section id="aboutSection" class="connections-section about-section" aria-label="About Me"><div id="aboutSlot"><\/div><\/section>/);
  assert.match(editor, /\['#bannerSection','banner','Banner'/); assert.match(editor, /\['#aboutSection','about','About Me'/);
  assert.match(editor, /for\(const key of \['avatar','name','bio','intro','roles','education','banner','about','socials'/);
  assert.match(account, /key==='banner'\?bannerLoaded&&bannerEditor\.isDirty\(\):key==='about'\?aboutLoaded&&aboutEditor\.isDirty\(\)/);
  assert.match(account, /await bannerEditor\.save\(\);/); assert.match(account, /const row=await api\.setMyAbout\(aboutEditor\.payload\(\)\);/);
  assert.doesNotMatch(banner + aboutJs, /innerHTML|insertAdjacentHTML/);
  assert.match(banner, /if \(!result \|\| result\.banner_path !== path\) \{ await api\.deleteBannerObject\(path\);/, "an unconfirmed upload is removed, never left counting against storage");
  assert.match(banner, /api\.attachMyBanner\(path, saved\.path\)/, "compare-and-set against the Banner the editor knows");
});

test("public desktop profile: only at >= 80rem without a published Wall, Intro frame in hostReveal, Discord inside My Socials, mobile untouched", () => {
  const page = read("dist/public/public.js"), desk = read("dist/public/public-desktop.js"), css = read("dist/public/public.css");
  assert.match(desk, /export const DESKTOP_QUERY = "\(min-width: 80rem\)";/);
  assert.match(page, /if \(!wall\) \{\n    desktopView = createDesktopProfile\(/, "never when a published, enabled Wall replaces the profile");
  assert.match(page, /config = wall \? \{ \.\.\.built, hostReveal: true \} : built;\n  if \(desktopActive\(\)\) config = \{ \.\.\.config, hostReveal: true \};/);
  assert.match(page, /if \(!wall && desktopActive\(\)\) showDesktop\(event\.data\.state\);\n      if \(wall\) showWall\(event\.data\.state\);/);
  assert.match(page, /config: \{ \.\.\.config, hostReveal: false, videoUrl: "" \}/, "crossing back below the breakpoint redraws the accepted frame profile without replaying the Intro");
  assert.match(page, /node\("section", "public-section public-section-discord"\)/);
  assert.match(css, /html\.is-public-desktop \.public-section-discord\{display:none\}/);
  assert.match(css, /\.desk-only\{display:none\}/, "desktop-only elements never show below the breakpoint");
  const desktopCss = css.slice(css.indexOf("/* DESKTOP CLASSIC PROFILE"));
  assert.doesNotMatch(desktopCss, /(^|[;{])\s*(min-|max-)?height\s*:/m, "no fixed heights: the Banner and Avatar use aspect-ratio");
  assert.doesNotMatch(desk, /innerHTML|insertAdjacentHTML|achievement|friends|teams/i, "only real data: no invented statistics");
  assert.match(desk, /if \(gamesCount > 0\)/, "the game count only when My Games is public");
  assert.match(read("dist/account/supabase-client.js"), /export const publicBannerUrl = handle => `\$\{SUPABASE_URL\}\/functions\/v1\/profile-banner\/\$\{encodeURIComponent\(handle\)\}`;/, "the Banner is never a Storage address");
});
