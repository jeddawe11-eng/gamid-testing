// GAME ID WALL - W0 PROTOTYPE - hosting shape A (top-level page) and, when loaded in a frame, the inner page of hosting shape B.
// One continuous vertical Wall in ordinary page scroll: zero gap between stages, no snap, no slides. Sample data only.
import * as M from "./model.js?v=w0d";
import { createSampleWall } from "./sample.js?v=w0d";
import { el, renderWallPage, attachColumnSizing, updateEmbedModes } from "./render.js?v=w0d";
import { EmbedController, activeIframeCount } from "./embeds.js?v=w0d";
import { startDiag } from "./diag.js?v=w0d";
import { createIntroSim } from "./intro-sim.js?v=w0d";

const q = new URLSearchParams(location.search);
const embedded = window.top !== window || q.get("embedded") === "1";
const state = { capPx: Number(q.get("col")) || 640, contain: q.get("contain") || "none", wall: q.get("wall") || "sample" };

function loadDoc() {
  if (state.wall === "local") {
    try {
      const raw = localStorage.getItem("gamid.w0.wall");
      if (raw) { const doc = JSON.parse(raw); if (M.validateDoc(doc).length === 0) return { doc, source: "editor Wall (this browser)" }; }
    } catch { /* fall through to the built-in sample */ }
  }
  return { doc: createSampleWall(), source: "built-in sample Wall" };
}
const { doc, source } = loadDoc();

const root = document.getElementById("root"), bar = document.getElementById("bar"), diagEl = document.getElementById("diag");
const controller = new EmbedController({ getNode: id => doc.nodes[id], root, onChange: () => diag.paint() });
let page = null, column = null, stopSizing = null, visibleStages = new Set(), observer = null;

function build() {
  stopSizing?.(); observer?.disconnect(); visibleStages = new Set();
  controller.closeAll();
  const built = renderWallPage(doc, { mode: "view", live: true, capPx: state.capPx, contain: state.contain, embeds: controller });
  page = built.page; column = built.column;
  root.replaceChildren(page);
  stopSizing = attachColumnSizing(page, column, () => updateEmbedModes(page, { live: true }));
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) { const index = Number(entry.target.dataset.stage); if (entry.isIntersecting) visibleStages.add(index + 1); else visibleStages.delete(index + 1); }
    diag.paint();
  }, { threshold: 0.25 });
  page.querySelectorAll(".stage").forEach(stage => observer.observe(stage));
}

// -- simulated Intro (shape A: overlay on the same top-level page; shape B: overlay inside the framed page)
const intro = createIntroSim({ onState: () => diag.paint() });

// -- controls
function button(label, onClick, cls = "pbtn") { const b = el("button", cls, label); b.type = "button"; b.addEventListener("click", onClick); return b; }
const tools = el("div", "tools"); tools.hidden = q.get("tools") !== "1";
const toggle = button("Tools", () => { tools.hidden = !tools.hidden; });
bar.append(el("span", "tag", embedded ? "SHAPE B - INNER PAGE" : "SHAPE A - TOP LEVEL"), toggle, tools);
tools.append(el("span", "plabel", `${source}. Column:`));
const capButtons = [];
for (const px of [560, 640, 720, 0]) {
  const b = button(px ? String(px) : "Full", () => { state.capPx = px || 4000; page.style.setProperty("--cap", `${state.capPx}px`); capButtons.forEach(x => x.classList.toggle("on", x === b)); diag.paint(); });
  if ((px || 4000) === state.capPx) b.classList.add("on");
  capButtons.push(b); tools.append(b);
}
const contain = document.createElement("select");
for (const [key, label] of [["none", "Seams: no containment"], ["clip", "Seams: clip"], ["paint", "Seams: paint containment"], ["cv", "Seams: content-visibility"]]) { const o = el("option", "", label); o.value = key; contain.append(o); }
contain.value = state.contain; contain.className = "pbtn";
contain.addEventListener("change", () => { state.contain = contain.value; column.dataset.contain = contain.value; diag.paint(); });
tools.append(contain, button("Play simulated Intro", () => intro.play()), button("Diag", () => { diagEl.hidden = !diagEl.hidden; diag.paint(); }));
if (!embedded) { const links = el("a", "pbtn", "Hub"); links.href = "index.html"; tools.append(links); }

// -- 100dvh / 100vh / 100svh / 100lvh probes (URL bar behaviour on real phones)
function probe(unit) { const p = el("div", "probe"); p.style.setProperty("height", `100${unit}`); document.body.append(p); return p; }
const probes = { dvh: probe("dvh"), svh: probe("svh"), lvh: probe("lvh"), vh: probe("vh") };

const diag = startDiag(diagEl, () => {
  const summary = controller.summary(), width = column ? column.getBoundingClientRect().width : 0;
  const px = Object.entries(probes).map(([unit, node]) => `${unit} ${Math.round(node.getBoundingClientRect().height)}`).join("  ");
  return {
    "hosting": embedded ? "B: inside an outer iframe (YouTube / Spotify nested one level deeper)" : "A: top-level page",
    "stage (>25% visible)": [...visibleStages].sort().join(",") || "-",
    "column": `${Math.round(width)} px  (candidate cap ${state.capPx >= 4000 ? "full" : state.capPx})`,
    "unit scale": `${(width / M.UNITS_W).toFixed(4)} px per unit`,
    nodes: `${Object.keys(doc.nodes).length}  (per stage ${doc.stages.map(s => s.children.length).join(" / ")})`,
    "iframes": `${activeIframeCount()} live  (active: ${summary.active} ${JSON.stringify(summary.byProvider)})`,
    "scroll": `y ${Math.round(scrollY)} of ${Math.round(document.documentElement.scrollHeight - innerHeight)}  intro ${intro.state}`,
    "viewport units": px,
    contain: state.contain,
  };
}, 1000);

build();
addEventListener("scroll", () => { if (!diagEl.hidden) diag.paint(); }, { passive: true });
if (q.get("diag") === "1") { diagEl.hidden = false; diag.paint(); }
if (q.get("intro") === "1") intro.play();
window.__w0view = { controller, get page() { return page; }, intro, state };
