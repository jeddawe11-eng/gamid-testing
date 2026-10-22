// Mobile Public Wall Visitor V2 - the browser E2E (local fixtures: the real /public/ visitor page and Wall renderer from this dist/, every anonymous read mocked,
// synthetic data only; NOT a device and NOT TESTING). Usage: node scripts/public-wall-mobile-check.mjs   (env as public-wall-mobile-browser.mjs; GAMID_WALL_BASELINE
// = a baseline dist/ for the tablet / desktop non-regression comparison; GAMID_WALL_ONLY = a comma list of sections to run)
import fs from "node:fs"; import path from "node:path";
import { open, geometry, close, out } from "./public-wall-mobile-browser.mjs";
import { ASSETS } from "./public-wall-fixtures.mjs";

const PORTRAIT = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932]];
const LANDSCAPE = [[568, 320], [667, 375], [740, 360], [812, 375], [844, 390], [932, 430]];
const LARGE = [[768, 1024], [1024, 768], [1280, 800], [1440, 900]];
const only = (process.env.GAMID_WALL_ONLY || "").split(",").filter(Boolean);
const run = name => !only.length || only.includes(name);
let fails = 0, passes = 0;
const results = [];
const check = (name, ok, detail) => { if (ok) passes++; else fails++; results.push({ name, ok, detail: ok ? undefined : detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail).slice(0, 600)}`); };
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const wait = (page, ms) => page.waitForTimeout(ms);

// what the visitor sees, measured in the page
const measure = page => page.evaluate(() => {
  const r = e => { const b = e.getBoundingClientRect(); return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const stages = [...document.querySelectorAll(".public-wall .wall-stage")];
  const nav = document.querySelector(".wall-stage-nav");
  const probe = document.querySelector(".public-wall-vh");
  return {
    inner: [innerWidth, innerHeight], usable: probe?.offsetHeight ?? innerHeight, scrollY, phone: document.documentElement.classList.contains("is-wall-phone"),
    overflowX: document.documentElement.scrollWidth > innerWidth, stages: stages.map(r),
    nav: nav && !nav.hidden && getComputedStyle(nav).display !== "none" ? { ...r(nav), label: nav.querySelector(".wall-stage-nav-label")?.textContent ?? "", buttons: [...nav.querySelectorAll("button")].filter(b => getComputedStyle(b).display !== "none" && !b.closest("[hidden]")).map(b => ({ name: b.getAttribute("aria-label"), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), disabled: b.disabled })) } : null,
    elementCounts: stages.map(s => s.querySelectorAll(":scope > .wall-el").length),
  };
});
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const overlaps = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
const docElement = (doc, stage, n) => doc.stages[stage].elements[n];

try {
  // 1. every phone size: geometry, faithful coordinates, navigator, content
  if (run("sizes")) for (const [width, height] of [...PORTRAIT, ...LANDSCAPE]) {
    const tag = `${width}x${height}`, landscape = width > height;
    const { context, page, errors, doc } = await open("mixed", { width, height });
    const m = await measure(page);
    const s = m.stages[0], ratio = doc.canvas.height / doc.canvas.width, scale = s.width / doc.canvas.width;
    check(`${tag}: phone presentation, no horizontal page scroll`, m.phone && !m.overflowX, m);
    check(`${tag}: every stage keeps the Wall's proportions (9:16) and the same size`, m.stages.length === 3 && m.stages.every(st => near(st.height / st.width, ratio, 0.01) && near(st.width, s.width, 0.5)), m.stages);
    check(`${tag}: one whole stage fits the screen${landscape ? "" : " above the stage bar"}`, s.height <= m.usable - (landscape ? 0 : 64) + 1 && s.width <= width, { stage: s, usable: m.usable });
    check(`${tag}: the stage is centred, inside the screen`, near(s.left, width - s.right, 2) && s.left >= 0 && s.right <= width, s);
    // faithful coordinates: the photo (stage 1, element 2) sits exactly at its saved place, scaled
    const photo = docElement(doc, 0, 1), box = await page.locator('.public-wall .wall-stage >> nth=0').locator(".wall-el >> nth=1").boundingBox();
    check(`${tag}: elements keep their saved coordinates (scaled, not rearranged)`, near(box.x - s.left, photo.x * scale, 1.5) && near(box.y - (s.top), photo.y * scale, 1.5) && near(box.width, photo.width * scale, 1.5), { box, want: [photo.x * scale, photo.y * scale, photo.width * scale] });
    check(`${tag}: every element of every stage is painted`, JSON.stringify(m.elementCounts) === JSON.stringify(doc.stages.map(st => st.elements.length)), m.elementCounts);
    check(`${tag}: the navigator shows "1 / 3" with 44px controls`, m.nav?.label === "1 / 3" && m.nav.buttons.length >= 2 && m.nav.buttons.every(b => b.w >= 44 && b.h >= 44), m.nav);
    check(`${tag}: the navigator never covers the stage on screen`, !overlaps(m.nav, s), { nav: m.nav, stage: s });
    check(`${tag}: ${landscape ? "landscape offers Fit / Wide" : "portrait has no Fit / Wide"}`, landscape === Boolean(m.nav?.buttons.some(b => /stage as wide|whole stage/.test(b.name ?? ""))), m.nav?.buttons);
    // content: custom font, GIF, Living Fire, videos, player facade, links
    const content = await page.evaluate(() => ({
      font: [...document.fonts].some(f => /GamID Custom/.test(f.family) && f.status === "loaded"),
      gif: [...document.querySelectorAll(".public-wall img")].some(i => i.complete && i.naturalWidth === 1),
      fire: Boolean(document.querySelector(".public-wall .wall-el.has-fire")),
      videos: document.querySelectorAll(".public-wall video").length,
      facade: Boolean(document.querySelector('.public-wall [data-wall-interactive], .public-wall button')),
      link: [...document.querySelectorAll(".public-wall a[href]")].map(a => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]),
    }));
    check(`${tag}: custom font, GIF, Living Fire, video layer + background, player and links are all there`, content.font && content.gif && content.fire && content.videos >= 2 && content.facade && content.link.length >= 2, content);
    check(`${tag}: links open a new tab without opener / referrer`, content.link.every(([, target, rel]) => target === "_blank" && /noopener/.test(rel) && /noreferrer/.test(rel)), content.link);
    if ([[320, 568], [390, 844], [430, 932], [568, 320], [844, 390], [932, 430]].some(([w, h]) => w === width && h === height)) {
      await shot(page, `wall-${tag}-stage1`);
      await page.locator(".wall-stage-nav .is-next").click(); await wait(page, 700);
      await shot(page, `wall-${tag}-stage2`);
    }
    check(`${tag}: no page errors`, errors.length === 0, errors);
    await context.close();
  }

  // 2. navigation: Next / Previous, the label follows manual scrolling, ends are disabled, a long Wall is fully reachable
  if (run("navigation")) for (const [width, height] of [[390, 844], [844, 390]]) {
    const tag = `${width}x${height}`;
    const { context, page, errors } = await open("long", { width, height, reducedMotion: "reduce" });
    const label = async () => (await measure(page)).nav?.label;
    check(`${tag} long Wall: starts at 1 / 8, Previous disabled`, await label() === "1 / 8" && await page.locator(".wall-stage-nav .is-prev").isDisabled());
    const seen = [];
    for (let i = 0; i < 7; i++) { await page.locator(".wall-stage-nav .is-next").click(); await wait(page, 250); seen.push(await label()); }
    const m = await measure(page);
    check(`${tag} long Wall: Next walks through every stage in order, without skipping`, JSON.stringify(seen) === JSON.stringify(["2 / 8", "3 / 8", "4 / 8", "5 / 8", "6 / 8", "7 / 8", "8 / 8"]), seen);
    check(`${tag} long Wall: the last stage is on screen, Next disabled`, await page.locator(".wall-stage-nav .is-next").isDisabled() && m.stages[7].top < m.inner[1] / 2 && m.stages[7].bottom > m.inner[1] / 2, m.stages[7]);
    await page.locator(".wall-stage-nav .is-prev").click(); await wait(page, 250);
    check(`${tag} long Wall: Previous goes back one stage`, await label() === "7 / 8");
    await page.evaluate(() => { const s = document.querySelectorAll(".public-wall .wall-stage")[2]; scrollTo(0, s.getBoundingClientRect().top + scrollY); }); await wait(page, 400);
    check(`${tag} long Wall: the label follows the visitor's own scrolling`, await label() === "3 / 8", await label());
    check(`${tag} long Wall: reduced motion moves instantly`, await page.evaluate(() => { const before = scrollY; document.querySelector(".wall-stage-nav .is-next").click(); return scrollY !== before; }));
    check(`${tag}: no page errors`, errors.length === 0, errors);
    await context.close();
  }

  // 3. rotation: the stage, the place in it and the playing videos survive portrait -> landscape -> portrait; Fit / Wide
  if (run("rotation")) {
    const { context, page, errors } = await open("mixed", { width: 390, height: 844 });
    await page.locator(".wall-stage-nav .is-next").click(); await wait(page, 900);
    const marked = await page.evaluate(() => { const v = document.querySelectorAll(".public-wall video"); v.forEach((video, i) => { video.dataset.fixtureMark = String(i); }); return v.length; });
    const t0 = await page.evaluate(() => [...document.querySelectorAll(".public-wall video")].map(v => v.currentTime));
    const sizes = [[844, 390], [390, 844], [932, 430], [430, 932]], labels = [];
    for (const [w, h] of sizes) { await page.setViewportSize({ width: w, height: h }); await wait(page, 700); const m = await measure(page); labels.push({ size: `${w}x${h}`, label: m.nav?.label, stage2: m.stages[1] && m.stages[1].top <= m.inner[1] / 2 && m.stages[1].bottom >= m.inner[1] / 2, width: Math.round(m.stages[0].width) }); }
    check("rotation: the visitor stays on stage 2 through four rotations", labels.every(l => l.label === "2 / 3" && l.stage2), labels);
    const kept = await page.evaluate(() => [...document.querySelectorAll(".public-wall video")].filter(v => v.dataset.fixtureMark !== undefined).length);
    const t1 = await page.evaluate(() => [...document.querySelectorAll(".public-wall video")].map(v => v.currentTime));
    check("rotation: the same video elements continue (no restart, no new download)", marked >= 2 && kept === marked && t1.every((t, i) => t >= (t0[i] ?? 0)), { marked, kept, t0, t1 });
    await page.setViewportSize({ width: 844, height: 390 }); await wait(page, 700);
    const fitWidth = (await measure(page)).stages[0].width;
    await page.locator(".wall-stage-nav-fit").click(); await wait(page, 700);
    const wide = await measure(page);
    check("landscape Wide: the stage fills the column (beside the rail), the visitor stays on stage 2", wide.stages[0].width > fitWidth * 2 && wide.stages[0].right <= 844 - 60 && wide.nav?.label === "2 / 3" && !wide.overflowX, { fitWidth, wide: wide.stages[0], label: wide.nav?.label });
    await shot(page, "wall-844x390-wide");
    await page.locator(".wall-stage-nav-fit").click(); await wait(page, 700);
    check("landscape Fit again: the whole stage", near((await measure(page)).stages[0].width, fitWidth, 1));
    check("rotation: no page errors", errors.length === 0, errors);
    await context.close();
  }

  // 4. players: an open inline player survives a rotation (the Wall is scaled, not repainted) and the repaint follows its Close; fullscreen is never interrupted
  if (run("players")) {
    const { context, page, errors } = await open("mixed", { width: 390, height: 844 });
    await page.locator(".wall-stage-nav .is-next").click(); await wait(page, 800);
    const facade = page.locator(".public-wall .wall-stage >> nth=1").locator("[data-wall-interactive]").last();
    await facade.click(); await wait(page, 600);
    const frame = await page.evaluate(() => { const f = document.querySelector(".public-wall iframe"); if (f) f.dataset.fixtureMark = "1"; return Boolean(f); });
    await page.setViewportSize({ width: 844, height: 390 }); await wait(page, 800);
    const during = await page.evaluate(() => ({ same: document.querySelector('.public-wall iframe[data-fixture-mark="1"]')?.isConnected === true, zoom: document.querySelector(".public-wall-column")?.style.zoom }));
    check("player: an open inline player keeps playing through a rotation (same frame; the Wall is scaled meanwhile)", frame && during.same && Number(during.zoom) > 0 && Number(during.zoom) < 1, { frame, during });
    await page.locator(".public-wall .wall-player-bar button").first().click(); await wait(page, 800);
    const after = await page.evaluate(() => ({ zoom: document.querySelector(".public-wall-column")?.style.zoom ?? "", width: Math.round(document.querySelector(".public-wall .wall-stage").getBoundingClientRect().width) }));
    check("player: after Close the Wall is repainted at its real landscape size", !after.zoom && near(after.width, 219, 2), after);
    // fullscreen (simulated: a fullscreenElement during the resize): no repaint until it ends
    await page.evaluate(() => { document.querySelector(".public-wall .wall-stage").dataset.fixtureMark = "1"; Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.body }); });
    await page.setViewportSize({ width: 390, height: 844 }); await wait(page, 800);
    const inFull = await page.evaluate(() => document.querySelector('.public-wall .wall-stage[data-fixture-mark="1"]') !== null);
    await page.evaluate(() => { delete document.fullscreenElement; document.dispatchEvent(new Event("fullscreenchange")); }); await wait(page, 800);
    const outFull = await page.evaluate(() => ({ old: document.querySelector('.public-wall .wall-stage[data-fixture-mark="1"]') !== null, width: Math.round(document.querySelector(".public-wall .wall-stage").getBoundingClientRect().width) }));
    check("player fullscreen: nothing is repainted while fullscreen; the repaint follows when it ends", inFull && !outFull.old && outFull.width === 390, { inFull, outFull });
    check("players: no page errors", errors.length === 0, errors);
    await context.close();
  }

  // 5. states: missing media, an empty Wall, a Wall that cannot be drawn, a one-stage Wall
  if (run("states")) {
    {
      const { context, page, errors } = await open("mixed", { width: 390, height: 844, failMedia: new Set([ASSETS.photo.asset_id, ASSETS.clip.asset_id, ASSETS.wallBg.asset_id]) });
      const m = await measure(page);
      check("missing media: the Wall still draws every stage and element (placeholders), nothing technical shown", m.stages.length === 3 && JSON.stringify(m.elementCounts) === "[7,5,4]" && !/error|exception|storage|token/i.test(await page.locator(".public-wall").innerText()), m.elementCounts);
      check("missing media: no page errors", errors.length === 0, errors);
      await shot(page, "wall-390x844-missing-media");
      await context.close();
    }
    {
      const { context, page, errors } = await open("empty", { width: 390, height: 844 });
      const m = await measure(page);
      check("empty Wall: its one empty stage shows, no navigator, no errors", m.stages.length === 1 && !m.nav && errors.length === 0, { m, errors });
      await context.close();
    }
    {
      const { context, page, errors } = await open("one", { width: 844, height: 390 });
      const m = await measure(page);
      check("one-stage Wall in landscape: no stage steps, Fit / Wide offered", m.stages.length === 1 && m.nav && !m.nav.label && m.nav.buttons.length === 1, m.nav);
      check("one-stage Wall: no page errors", errors.length === 0, errors);
      await context.close();
    }
    {
      const bad = JSON.parse(JSON.stringify((await import("./public-wall-fixtures.mjs")).oneStage()));
      bad.stages[0].elements[0].type = "unknownType";
      const { context, page, errors } = await open("one", { width: 390, height: 844, doc: bad, drawn: false }).catch(() => ({}));
      if (!page) check("a Wall that cannot be drawn: the page opened", false);
      else {
        await page.waitForSelector(".public-wall-state", { timeout: 8000 }).catch(() => {});
        const text = await page.locator(".public-wall-state").innerText().catch(() => "");
        check("a Wall that cannot be drawn: a plain message instead of an empty page", /can't be shown right now/.test(text) && !(await measure(page)).nav, text);
        check("a Wall that cannot be drawn: no page errors", errors.length === 0, errors);
        await context.close();
      }
    }
  }

  // 5b. the Intro still plays first; the navigator only belongs to the Wall (never over the Intro or its replay); Back to @previous and Replay Intro stay usable
  if (run("intro")) for (const [width, height] of [[390, 844], [844, 390]]) {
    const tag = `${width}x${height}`;
    const { context, page, errors } = await open("mixed", { width, height, intro: true, from: "fixture_friend" });
    const during = await measure(page);
    check(`${tag} Intro: it plays first, no Wall navigator over it`, !during.nav && !(await page.evaluate(() => document.documentElement.classList.contains("is-public-wall") && !document.documentElement.classList.contains("is-public-wall-reveal"))), during.nav);
    const skip = () => page.locator(".identity-skip").click();   // a visitor from another GamID skips with the page's own Skip Intro (visitor-nav)
    await skip();
    await page.waitForFunction(() => document.documentElement.classList.contains("is-public-wall") && document.querySelector(".public-wall .wall-stage"), null, { timeout: 20000 }); await wait(page, 900);
    const shown = await measure(page);
    const back = await page.evaluate(() => { const n = document.querySelector(".identity-nav"); if (!n || n.hidden) return null; const r = n.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
    check(`${tag} Intro skipped: the Wall and its navigator show; Back to @previous does not collide with the navigator`, shown.stages.length === 3 && shown.nav?.label === "1 / 3" && back && !overlaps(back, shown.nav), { nav: shown.nav, back });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await wait(page, 600);
    const replay = await page.evaluate(() => { const b = document.getElementById("replayIntroButton").getBoundingClientRect(), n = document.querySelector(".wall-stage-nav").getBoundingClientRect(); return { replay: [b.top, b.bottom, b.left, b.right], nav: [n.top, n.bottom, n.left, n.right], visible: b.bottom <= innerHeight && b.top >= 0 }; });
    const clear = !(replay.replay[2] < replay.nav[3] && replay.nav[2] < replay.replay[3] && replay.replay[0] < replay.nav[1] && replay.nav[0] < replay.replay[1]);
    check(`${tag}: at the end of the Wall Replay Intro is on screen and clear of the navigator`, replay.visible && clear, replay);
    await page.locator("#replayIntroButton").click(); await wait(page, 800);
    check(`${tag} Replay Intro: the Intro plays again, the Wall navigator is gone`, !(await measure(page)).nav && await page.evaluate(() => !document.getElementById("experienceWrap").hidden));
    await skip();
    await page.waitForFunction(() => document.querySelector(".wall-stage-nav") && !document.querySelector(".wall-stage-nav").hidden, null, { timeout: 15000 }).catch(() => {});
    check(`${tag} after the replay: the Wall and its navigator are back`, (await measure(page)).nav?.label === "1 / 3");
    check(`${tag} Intro: no page errors`, errors.length === 0, errors);
    await context.close();
  }

  // 6. media requests: videos only near the screen (F3), later pictures only near their stage (F7-A) - recorded, not changed by this task
  if (run("media")) for (const [width, height] of [[390, 844], [844, 390]]) {
    const { context, page, requests } = await open("long", { width, height });
    const n = await page.evaluate(() => document.querySelectorAll(".public-wall video").length);
    await context.close();
    const mixed = await open("mixed", { width, height });
    await wait(mixed.page, 1200);
    const atLoad = mixed.requests.filter(r => r.kind !== "rpc").map(r => `${r.kind}:${r.asset ?? r.host ?? ""}`);
    results.push({ name: `media requests at load ${width}x${height}`, ok: true, detail: atLoad });
    console.log(`INFO  media requests at load ${width}x${height}: ${atLoad.join(" ")}`);
    check(`${width}x${height}: the long Wall (no media) asks for no media`, n === 0 && requests.every(r => ["rpc"].includes(r.kind)), requests.filter(r => r.kind !== "rpc"));
    await mixed.context.close();
  }

  // 7. tablet and desktop: exactly the accepted column (geometry identical to the baseline dist/), no navigator
  if (run("large")) {
    const baseline = process.env.GAMID_WALL_BASELINE;
    for (const [width, height] of LARGE) {
      const tag = `${width}x${height}`;
      const now = await open("mixed", { width, height });
      const g = await geometry(now.page), m = await measure(now.page);
      check(`${tag}: no phone presentation, no navigator, column width = min(900, page)`, !m.phone && !m.nav && near(m.stages[0].width, Math.min(900, width), 1) && !m.overflowX, { phone: m.phone, nav: m.nav, w: m.stages[0].width });
      check(`${tag}: no page errors`, now.errors.length === 0, now.errors);
      await shot(now.page, `wall-${tag}`);
      await now.context.close();
      if (baseline) {
        process.env.GAMID_WALL_ROOT = baseline;
        const base = await import(`./public-wall-mobile-browser.mjs?baseline=${width}x${height}`);   // a separate instance that serves the baseline dist/
        const was = await base.open("mixed", { width, height });
        const gb = await base.geometry(was.page);
        await was.context.close(); await base.close();
        delete process.env.GAMID_WALL_ROOT;
        check(`${tag}: stage geometry identical to the baseline`, JSON.stringify(gb.stages) === JSON.stringify(g.stages) && gb.scrollHeight === g.scrollHeight, { baseline: gb.stages, now: g.stages });
      }
    }
  }
} finally {
  await close();
  fs.writeFileSync(path.join(out, "check-results.json"), JSON.stringify(results, null, 1));
  console.log(fails ? `${fails} FAILED, ${passes} passed` : `ALL PASS (${passes})`);
  process.exitCode = fails ? 1 : 0;
}
