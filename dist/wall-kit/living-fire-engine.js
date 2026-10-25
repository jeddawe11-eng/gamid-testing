// Living Fire V3 renderer for Wall text (Mazen's task "Living Fire V3 Phase C", 2026-10-18). Loaded ONLY when a painted Wall has a Living Fire text (living-fire.js
// imports it on demand). The look is the approved V3 package unchanged: the vertex and fragment shaders below are its sources VERBATIM (pinned by a test against
// the package's source/living-inferno-v3.frag) and the distance field is its exact EDT (living-fire-sdf.js). What is new is only how it is hosted on a Wall:
//   - ONE WebGL2 context per page draws every fire text in turn (shader, noise texture and buffers are shared), then each frame is copied into that text's own 2D canvas;
//   - one distance-field texture per distinct text / font / size, shared by every element showing it and cached across editor repaints;
//   - the field is computed in a Worker; the animation runs entirely in the visitor's browser (no request per frame, nothing streamed);
//   - at most LIVE_LIMIT texts animate at once (the first ones on screen); the rest show a still V3 frame. Off-screen or hidden pages pause; reduced motion = still;
//   - no WebGL2, a failed shader or a lost context = the readable static fallback (living-fire.js); the context is released after IDLE_RELEASE_MS with no fire text.
import { buildSdf, SDF_W, SDF_H } from "./living-fire-sdf.js";
import { FIRE_LIVE_LIMIT } from "./living-fire.js";
import { liveAllowance, reportLive } from "./effects-budget.js";   // Pro Effects (2026-10-25): the live budget is shared with Living Ice and Living Radiation

const DESIGN_W = SDF_W, DESIGN_H = SDF_H;
const VS = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uSdf,uNoise;
uniform vec2 uResolution;
uniform vec4 uBounds;
uniform float uTime,uSize,uIntensity,uTurbulence;
uniform int uMode,uColor,uDirection;
uniform bool uSparks,uEmpty;
out vec4 outColor;
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture(uNoise,(i+f+.5)/256.).r;}
float fbm(vec2 p){float r=0.,a=.54;for(int i=0;i<4;i++){r+=a*n(p);p=mat2(.8,-.6,.6,.8)*p*2.03+17.3;a*=.48;}return r;}
float sd(vec2 p){if(any(lessThan(p,vec2(0)))||any(greaterThan(p,vec2(1200,640))))return -256.;return texture(uSdf,p/vec2(1200,640)).r;}
float smax(float a,float b,float k){float h=clamp(.5+.5*(a-b)/k,0.,1.);return mix(b,a,h)+k*h*(1.-h);}
vec3 blackbodyArt(float h){
 h=clamp(h,0.,1.);vec3 c=mix(vec3(.10,.0007,.0001),vec3(.88,.025,.0007),smoothstep(.04,.31,h));
 c=mix(c,vec3(1.,.22,.005),smoothstep(.28,.53,h));
 c=mix(c,vec3(1.,.69,.09),smoothstep(.5,.77,h));
 c=mix(c,vec3(1.,.97,.67),smoothstep(.73,.93,h));
 return mix(c,vec3(1.,.999,.96),smoothstep(.9,1.,h));
}
vec3 palette(float h){vec3 c=blackbodyArt(h);if(uColor==1)c*=mix(vec3(1.,.5,.55),vec3(1.),smoothstep(.65,1.,h));if(uColor==2)c=mix(vec3(.035,.035,.32),vec3(.14,.60,1.),smoothstep(.1,.7,h))*(1.-smoothstep(.7,1.,h))+vec3(.86,1.,1.)*smoothstep(.7,1.,h);return c;}
void main(){
 if(uEmpty){outColor=vec4(0);return;}
 vec2 p=vec2(gl_FragCoord.x/uResolution.x*1200.,(1.-gl_FragCoord.y/uResolution.y)*640.);
 float s=max(uSize,15.),t=uTime;bool full=uMode==0;
 if(p.x<uBounds.x-s*.3||p.x>uBounds.y+s*.3||p.y<uBounds.z-s*(full?1.0:.36)||p.y>uBounds.w+s*.28){outColor=vec4(0);return;}
 float raw=sd(p);if(!full&&raw<-s*.32){outColor=vec4(0);return;}
 vec2 a=p/s;
 float strength=(.6+.4*uIntensity)*uTurbulence;
 vec2 q,flow,warp;float fuel,roll,lift,detail,edge;
 if(uDirection==0){
  // ORGANIC: buoyant rolls of burning gas, continuous upward transport.
  q=vec2(fbm(a*vec2(3.1,2.)+vec2(.06*t,.73*t)),fbm(a*vec2(3.3,2.2)+vec2(11.3-.1*t,.68*t)));
  flow=vec2(fbm(a*vec2(4.8,2.5)+q*2.8+vec2(.1*t,t*.98)),fbm(a*vec2(4.4,3.1)+q*2.6+vec2(8.,t*.87)));
  warp=(flow-.49)*s*vec2(.24,.22)*strength;
  fuel=fbm(a*vec2(15.,6.8)+flow*4.+vec2(.09*t,t*2.4));
  roll=fbm(a*vec2(7.8,4.3)+q*3.+vec2(-.1*t,t*1.6));
  lift=smoothstep(.38,.68,roll)*s*.11*strength;
 }else if(uDirection==1){
  // CINEMATIC: alternating sweeping ignition fronts and dark breathing voids.
  q=vec2(fbm(a*vec2(2.5,2.)+vec2(.10*t,.58*t)),fbm(a*vec2(2.8,1.8)+vec2(14.,.63*t)));
  float surge=sin(a.x*2.1+a.y*3.7-t*.93+q.x*3.);
  flow=vec2(fbm(a*vec2(4.8,3.4)+q*3.3+vec2(0.,t*1.1)),fbm(a*vec2(4.6,2.7)+q*2.6+vec2(9.,t*.9)));
  warp=((flow-.5)*vec2(.18,.17)+vec2(surge*.018,sin(a.x*2.7-t*.7)*.012))*s*strength;
  fuel=fbm(a*vec2(12.,7.)+flow*4.1+vec2(.12*t,t*2.8));
  roll=fbm(a*vec2(6.5,3.8)+q*2.8+vec2(.07*t,t*1.8));
  lift=smoothstep(.33,.65,roll+.07*surge)*s*.13*strength;
 }else{
  // MYTHIC: helical character-scale currents with expressive local shape changes.
  float helix=sin(a.y*4.7+t*.83+sin(a.x*1.7-t*.4)*1.7);
  q=vec2(fbm(a*vec2(2.7,2.3)+vec2(.08*t,.57*t)),fbm(a*vec2(3.,2.)+vec2(18.,-.51*t)));
  flow=vec2(fbm(a*vec2(4.5,3.2)+q*3.4+vec2(0.,t*.98)),fbm(a*vec2(4.2,2.8)+q*3.+vec2(8.,t*.71)));
  warp=((flow-.5)*vec2(.20,.19)+vec2(helix*.022,cos(a.x*3.1-t*.6)*.018))*s*strength;
  fuel=fbm(a*vec2(13.,7.5)+flow*4.+vec2(.1*t,t*2.2));
  roll=fbm(a*vec2(6.,4.)+q*3.+vec2(.13*t,t*1.3));
  lift=smoothstep(.31,.68,roll+.06*helix)*s*.16*strength;
 }
 detail=n(a*vec2(39.,18.)+flow*5.+vec2(0.,t*4.1));
 edge=(n(a*vec2(24.,12.)+q*3.+vec2(0.,t*2.7))-.5)*s*.035*strength;
 vec2 b=p+warp;
 float base=sd(b)+edge;
 // A connected, time-varying tongue is part of the BODY field. It grows from
 // and dissolves back into the same character, including in Letters Only.
 float tendril=sd(b+vec2((flow.y-.48)*s*.1,lift))-lift*.4+edge;
 float d=smax(base,tendril,s*.018);
 float pockets=smoothstep(.54,.73,fuel);
 float hollow=(uDirection==1? .035 :uDirection==2?.032:.026)*s;
 d-=pockets*hollow*strength;
 float aa=max(.7,1200./uResolution.x*.8),coverage=smoothstep(-aa,aa,d);
 if(uMode==2){outColor=vec4(vec3(coverage),coverage);return;}
 float depth=smoothstep(-s*.013,s*.07,d);
 // Broad density + fine traveling reaction sheets, rather than a bright crust
 // painted onto an opaque font. Pockets alter both geometry and transmittance.
 float reaction=pow(clamp(1.-abs(fuel-.475)*5.,0.,1.),3.);
 float ignition=pow(smoothstep(.46,.67,roll),2.2);
 float heat=.10+depth*.14+roll*.23+reaction*.37+ignition*.20+(detail-.5)*.10;
 if(uDirection==1)heat=(heat-.19)*1.20+.18+reaction*.09;
 if(uDirection==2)heat+=reaction*.065+ignition*.06;
 heat=clamp(heat*(.92+.13*uIntensity),0.,1.);
 float density=.45+depth*.48+roll*.65+reaction*.33-pockets*.70;
 float optical=1.-exp(-max(.02,density)*(uDirection==1?1.8:1.55));
 float alpha=coverage*optical;
 vec3 premul=palette(heat)*alpha;
 if(full){
  // Eight connected, soft density samples reuse the body flow. The body above
  // already animates without these exterior sheets or any particle branch.
  float cloud=0.,reach=uDirection==1?.78:uDirection==2?.65:.54;
  for(int i=1;i<=8;i++){
   float z=float(i)/8.,h=z*s*reach*(.7+.35*uIntensity);
   float bend=(flow.x-.49)*.25+(uDirection==2?sin(a.y*3.8+t*.7+z*4.)*.06:0.);
   vec2 v=b+vec2(bend*s*z,h+(roll-.5)*s*.07*z);
   float shape=smoothstep(-s*.075,s*.05,sd(v));
   float gas=.65*n(v/s*vec2(17.,7.)+flow*3.+vec2(0.,t*2.+z))+.35*n(v/s*vec2(34.,13.)+q*3.+vec2(0.,t*3.7));
   cloud+=shape*max(0.,gas-(.30+z*.23))*pow(1.-z*.83,1.5)*.43;
  }
  float pa=clamp(cloud*1.5,0.,.62)*(1.-alpha);
  premul+=palette(.30+roll*.27)*pa;alpha+=pa;
  // Deliberately no broad artificial halo. Only weak near-field emission.
  float radiance=exp(-max(-d,0.)/(s*.019))*.055*uIntensity;
  radiance*=smoothstep(-s*.09,-s*.005,d);
  premul+=palette(.39)*radiance*(1.-alpha);alpha+=radiance*(1.-alpha);
  if(uSparks){for(int i=0;i<4;i++){
   float fi=float(i),z=fract(t*.16+n(vec2(fi,9.))),sx=100.+n(vec2(fi,4.))*1000.;
   float sy=mix(uBounds.z,uBounds.w,n(vec2(fi,18.))),alive=smoothstep(0.,5.,sd(vec2(sx,sy)));
   vec2 dp=(p-vec2(sx+sin(t+fi)*z*12.,sy-z*s*.6))/vec2(.8,1.7);
   float spark=exp(-dot(dp,dp))*sin(z*3.14159)*alive*.40;
   premul+=palette(.88)*spark;alpha=clamp(alpha+spark,0.,1.);
  }}
 }
 outColor=vec4(min(premul,vec3(1.)),clamp(alpha,0.,1.));
}
`;

export const LIVE_LIMIT = FIRE_LIVE_LIMIT;   // simultaneous animations (living-fire.js; measured in the Phase C audit)
export const TARGET_FPS = 32;          // the V3 engine's own frame budget
const MAX_W = 960, MAX_H = 512, MIN_W = 64;   // render resolution of one text (the V3 "Balanced 960" quality is the ceiling)
const IDLE_RELEASE_MS = 15000;
const CACHE_KEEP = 8;                  // unused distance-field textures kept for quick reuse (1.5 MB of GPU memory each)
const DIRECTION = { organic: 0, cinematic: 1, mythic: 2 };
const COLOR = { natural: 0, crimson: 1, blue: 2 };
const MODE = { full: 0, letters: 1 };
const STILL_TIME = 3;                  // the V3 engine's starting time: the still frame it shows for reduced motion

let gl = null, glCanvas = null, program = null, uniform = null, failed = false, lostContext = null;
const entries = new Set();
const times = new Map();               // element id -> its animation time, so an editor repaint (a new canvas) continues the same flames
const fields = new Map();              // key -> { key, texture, bounds, size, refs, used, pending }
let rafId = 0, last = 0, idleSince = 0, worker = null, workerBroken = false, nextJob = 1;
const jobs = new Map();
const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(seen => { for (const item of seen) { const entry = item.target.__fire; if (entry) { entry.visible = item.isIntersecting; if (entry.visible) entry.dirty = true; } } }, { threshold: 0 }) : null;

// The V3 shader takes up to ~0.8 s to compile on some GPUs (measured: ANGLE / D3D11). With KHR_parallel_shader_compile the compile runs off the page's main thread
// and the loop only asks whether it is done (COMPLETION_STATUS_KHR, non-blocking); the texts keep their static fallback until the first frame. Without the
// extension, asking for the link result waits for the compile - the V3 engine's own behaviour.
let ready = false, parallel = null;
function initGL() {
  if (gl || failed) return Boolean(gl);
  try {
    glCanvas = document.createElement("canvas"); glCanvas.width = MAX_W; glCanvas.height = MAX_H;
    gl = glCanvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
    if (!gl) { failed = true; return false; }
    parallel = gl.getExtension("KHR_parallel_shader_compile");
    const compile = (type, src) => { const shader = gl.createShader(type); gl.shaderSource(shader, src); gl.compileShader(shader); return shader; };
    const v = compile(gl.VERTEX_SHADER, VS), f = compile(gl.FRAGMENT_SHADER, FS);
    program = gl.createProgram(); gl.attachShader(program, v); gl.attachShader(program, f); gl.linkProgram(program);
    program.__shaders = [v, f];
    ready = false;
    lostContext = gl.getExtension("WEBGL_lose_context");
    glCanvas.addEventListener("webglcontextlost", event => { event.preventDefault(); dropContext(false); for (const entry of entries) entry.setState("static"); });
    return true;
  } catch { gl = null; failed = true; return false; }
}

// true once the program is linked and set up; false while compiling (or after a failure, which turns every text to the static fallback)
function programReady() {
  if (ready) return true;
  if (!gl || !program) return false;
  try {
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("living fire shader");
    for (const shader of program.__shaders) gl.deleteShader(shader);
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    uniform = {};
    for (const name of ["uSdf", "uNoise", "uResolution", "uTime", "uSize", "uIntensity", "uTurbulence", "uMode", "uColor", "uSparks", "uEmpty", "uDirection", "uBounds"]) uniform[name] = gl.getUniformLocation(program, name);
    // the V3 engine's noise texture, same seed and generator
    const bytes = new Uint8Array(256 * 256); let seed = 836719;
    for (let i = 0; i < bytes.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; bytes[i] = seed >>> 24; }
    const noise = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(uniform.uNoise, 1); gl.uniform1i(uniform.uSdf, 0);
    ready = true;
    for (const entry of entries) entry.dirty = true;
    return true;
  } catch {
    failed = true; ready = false;
    for (const entry of entries) entry.setState("static");
    try { lostContext?.loseContext(); } catch { /* nothing to release */ }
    gl = null; program = null;
    return false;
  }
}
function dropContext(lose) {
  for (const field of fields.values()) field.texture = null;
  fields.clear();
  if (lose) try { lostContext?.loseContext(); } catch { /* already gone */ }
  gl = null; glCanvas = null; program = null; uniform = null; ready = false;
}

export const supported = () => initGL();
export const isReady = () => programReady();

// ---- distance fields ----------------------------------------------------------------------------------------------------------------------------------------
function sdfInWorker(mask) {
  if (!workerBroken && !worker) {
    try { worker = new Worker(new URL("./living-fire-sdf.js", import.meta.url), { type: "module" }); worker.onmessage = event => { const job = jobs.get(event.data?.id); jobs.delete(event.data?.id); job?.(event.data?.sdf ? new Float32Array(event.data.sdf) : null); }; worker.onerror = () => { workerBroken = true; worker = null; for (const job of jobs.values()) job(null); jobs.clear(); }; }
    catch { workerBroken = true; worker = null; }
  }
  if (!worker) return Promise.resolve(buildSdf(mask.data));
  return new Promise(resolve => { const id = nextJob++; jobs.set(id, sdf => resolve(sdf ?? buildSdf(mask.data))); worker.postMessage({ id, mask: mask.data.buffer, w: DESIGN_W, h: DESIGN_H }, [mask.data.buffer]); });
}

// The letters for the V3 field, laid out EXACTLY like the painted text (paint.js): the same line breaks (wrap on = the box width, word by word, a word wider
// than the box broken anywhere; wrap off = only the text's own line breaks), the same alignment, line height and position in the box. Only the size differs:
// everything is drawn at a design size that fits the V3 frame (lines at most 1000 design units, room above for the flames, as V3 sizes its one line), and
// place() scales the frame back to the text's own size. A single centred line that fits is exactly V3's own layout (same size, same baseline rule).
export function breakLines(c, text, maxWidth) {
  const width = line => c.measureText(line).width;
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (!Number.isFinite(maxWidth)) { lines.push(paragraph); continue; }
    let line = "";
    const flushWord = word => {   // a word wider than the box: broken anywhere (overflow-wrap: anywhere)
      let part = "";
      for (const ch of Array.from(word)) { if (part && width((part + ch).trimEnd()) > maxWidth) { lines.push(part); part = ch; } else part += ch; }
      return part;
    };
    for (const token of paragraph.split(/(?<=\s)(?=\S)/)) {
      if (width((line + token).trimEnd()) <= maxWidth) { line += token; continue; }
      if (line) { lines.push(line.trimEnd()); line = ""; }
      line = width(token.trimEnd()) > maxWidth ? flushWord(token) : token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function layoutLetters(spec) {
  const mask = document.createElement("canvas"); mask.width = DESIGN_W; mask.height = DESIGN_H;
  const c = mask.getContext("2d", { willReadFrequently: true });
  const setSize = px => { c.font = `${spec.italic ? "italic " : ""}${spec.weight} ${px}px ${spec.family}`; if ("letterSpacing" in c) c.letterSpacing = `${spec.letterSpacing * px}px`; };
  // 1. line breaks at the reference size (wrapping scales with the font size, so the breaks hold at any size)
  setSize(spec.size);
  const lines = breakLines(c, spec.text, spec.wrap ? spec.boxEm * spec.size : Infinity);
  const measure = size => {
    setSize(size);
    const metrics = lines.map(line => c.measureText(line));
    const fontBox = c.measureText("Hg");
    const ascentFont = fontBox.fontBoundingBoxAscent || size * 0.8, descentFont = fontBox.fontBoundingBoxDescent || size * 0.2;
    const lineBox = spec.lineHeight * size;
    // the CSS line box: half-leading above, then the font ascent to the baseline
    const baselines = lines.map((_, i) => i * lineBox + (lineBox - ascentFont - descentFont) / 2 + ascentFont);
    const inked = metrics.map((m, i) => (lines[i].trim() ? i : -1)).filter(i => i >= 0);
    const top = inked.length ? Math.min(...inked.map(i => baselines[i] - (metrics[i].actualBoundingBoxAscent || size * 0.75))) : 0;
    const bottom = inked.length ? Math.max(...inked.map(i => baselines[i] + (metrics[i].actualBoundingBoxDescent || 0))) : lineBox;
    return { metrics, baselines, top, bottom, widths: metrics.map(m => m.width) };
  };
  // 2. the size: lines within 1000 design units and the flames' room above, as V3 fits its one line
  let first = measure(spec.size);
  const widest = Math.max(1, ...first.widths), inkHeight = Math.max(1, first.bottom - first.top);
  const k = Math.min(1, (DESIGN_W - 200) / widest, (0.58 * DESIGN_H) / (0.58 * inkHeight + 0.8 * spec.size));
  const size = spec.size * k;
  const laid = k === 1 ? first : measure(size);
  // 3. each line where the painted text puts it in its box (an overflowing line starts at the start edge, as CSS does)
  const boxWidth = spec.boxEm * size;
  const offsets = laid.widths.map(w => (w > boxWidth ? (spec.rtl ? boxWidth - w : 0) : spec.align === "center" ? (boxWidth - w) / 2 : spec.align === "right" ? boxWidth - w : 0));
  const minX = Math.min(...offsets), maxX = Math.max(...offsets.map((x, i) => x + laid.widths[i]));
  const boxLeft = DESIGN_W / 2 - (minX + maxX) / 2;                                   // design x of the box's left edge
  const boxTop = (DESIGN_H - (laid.bottom - laid.top)) * 0.58 - laid.top;              // design y of the box's top edge (V3's 58% rule for the inked block)
  c.fillStyle = "#fff"; c.textAlign = "left"; c.direction = spec.rtl ? "rtl" : "ltr";
  lines.forEach((line, i) => { if (line.trim()) c.fillText(line, boxLeft + offsets[i], boxTop + laid.baselines[i]); });
  return { mask: c.getImageData(0, 0, DESIGN_W, DESIGN_H), size, boxLeft, boxTop, lines: lines.length,
    bounds: { left: boxLeft + minX, right: boxLeft + maxX, top: boxTop + laid.top, bottom: boxTop + laid.bottom }, empty: !spec.text.trim() };
}
function acquire(entry) {
  const key = entry.key;
  let field = fields.get(key);
  if (!field) {
    field = { key, texture: null, bounds: null, size: 0, empty: false, refs: 0, used: 0, pending: true, waiters: new Set() };
    fields.set(key, field);
    (async () => {
      try { await document.fonts.load(`${entry.spec.italic ? "italic " : ""}${entry.spec.weight} ${entry.spec.size}px ${entry.spec.family}`, entry.spec.text); } catch { /* the fallback family draws */ }
      const laid = layoutLetters(entry.spec);
      const sdf = await sdfInWorker(laid.mask);
      if (fields.get(key) !== field || !gl) return;
      const texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, DESIGN_W, DESIGN_H, 0, gl.RED, gl.FLOAT, sdf);
      Object.assign(field, { texture, bounds: laid.bounds, size: laid.size, boxLeft: laid.boxLeft, boxTop: laid.boxTop, lines: laid.lines, empty: laid.empty, pending: false });
      settle();
      for (const waiter of field.waiters) waiter();
      field.waiters.clear();
    })();
  }
  field.refs++; field.used = performance.now();
  if (!field.pending) { entry.field = field; remember(entry.id, field); entry.place(field); return; }
  // a new field (e.g. an editor resize changed the line breaks): until it is ready, this element keeps showing its last field, so it never flashes to static
  const interim = lastReady.get(entry.id);
  if (interim?.texture && !interim.pending) { interim.refs++; entry.interim = interim; entry.field = interim; entry.place(interim); }
  else entry.field = field;
  entry.next = field;
  field.waiters.add(() => {
    if (!entries.has(entry)) return;
    if (entry.interim) { releaseField(entry.interim); entry.interim = null; }
    entry.field = field; entry.next = null; remember(entry.id, field);
    entry.place(field); entry.dirty = true; drawEntry(entry, entry.time);
  });
}

// the last ready field of each element (one reference held), for the interim above
const lastReady = new Map();
function remember(id, field) {
  const previous = lastReady.get(id);
  if (previous === field) return;
  field.refs++;
  lastReady.set(id, field);
  if (previous) releaseField(previous);
}

function releaseField(field) {
  if (!field) return;
  field.refs = Math.max(0, field.refs - 1); field.used = performance.now();
  const unused = [...fields.values()].filter(item => item.refs === 0 && !item.pending).sort((a, b) => a.used - b.used);
  while (unused.length > CACHE_KEEP) { const old = unused.shift(); if (gl && old.texture) gl.deleteTexture(old.texture); fields.delete(old.key); }
}

// ---- drawing ------------------------------------------------------------------------------------------------------------------------------------------------
function drawEntry(entry, time) {
  const field = entry.field;
  if (!gl || !ready || !field || field.pending || !field.texture) return false;
  const w = entry.canvas.width, h = entry.canvas.height, f = entry.fire;
  gl.viewport(0, 0, w, h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, field.texture);
  gl.uniform2f(uniform.uResolution, w, h);
  gl.uniform1f(uniform.uTime, time);
  gl.uniform1f(uniform.uSize, field.size);
  gl.uniform1f(uniform.uIntensity, f.intensity);
  gl.uniform1f(uniform.uTurbulence, f.turbulence);
  gl.uniform1i(uniform.uMode, MODE[f.mode] ?? 0);
  gl.uniform1i(uniform.uDirection, DIRECTION[f.style] ?? 0);
  gl.uniform4f(uniform.uBounds, field.bounds.left, field.bounds.right, field.bounds.top, field.bounds.bottom);
  gl.uniform1i(uniform.uColor, COLOR[f.color] ?? 0);
  gl.uniform1i(uniform.uSparks, f.sparks ? 1 : 0);
  gl.uniform1i(uniform.uEmpty, field.empty ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  entry.ctx.clearRect(0, 0, w, h);
  entry.ctx.drawImage(glCanvas, 0, MAX_H - h, w, h, 0, 0, w, h);   // WebGL's origin is bottom-left: the frame is the bottom-left w x h of the shared canvas
  entry.dirty = false; entry.drawn = true;
  entry.setState("live");
  stats.draws++;
  return true;
}

const stats = { draws: 0, frames: 0, live: 0, still: 0, budget: LIVE_LIMIT };
// Adaptive budget: how many texts may animate now (1..LIVE_LIMIT). A slow device (measured: software rendering drops to 17 fps at 4 texts) steps down until the
// flames keep ~20 fps or more; a fast one steps back up. Texts over the budget show a still V3 frame.
let budget = LIVE_LIMIT, slowWindow = [], fastFrames = 0, lastAnimated = 0;
// a text added, removed or repainted (an editor change) is a transition, not a slow device: only steady frames are judged
const settle = () => { slowWindow = []; lastAnimated = 0; };
function adapt(stamp) {
  if (lastAnimated) {
    slowWindow.push(stamp - lastAnimated); if (slowWindow.length > 30) slowWindow.shift();
    const mean = slowWindow.reduce((a, b) => a + b, 0) / slowWindow.length, period = 1000 / TARGET_FPS;
    if (slowWindow.length === 30 && mean > period * 1.6 && budget > 1) { budget--; slowWindow = []; fastFrames = 0; }
    else if (mean < period * 1.2) { if (++fastFrames > 160 && budget < LIVE_LIMIT) { budget++; fastFrames = 0; slowWindow = []; } }
    else fastFrames = 0;
  }
  lastAnimated = stamp; stats.budget = budget;
}
export const engineStats = () => ({ ...stats, entries: entries.size, fields: fields.size, context: Boolean(gl), worker: Boolean(worker) && !workerBroken });

function loop(stamp) {
  rafId = 0;
  // a canvas leaves the page when its Wall is repainted or closed; one that never arrived within 5 s was discarded before being shown
  for (const entry of [...entries]) { if (entry.canvas.isConnected) entry.seen = true; else if (entry.seen || stamp - entry.born > 5000) unmount(entry); }
  if (!entries.size) { reportLive("fire", 0); if (!idleSince) idleSince = stamp; if (stamp - idleSince > IDLE_RELEASE_MS) { dropContext(true); idleSince = 0; return; } schedule(); return; }
  idleSince = 0;
  if (!programReady()) { if (!failed) schedule(); return; }
  const period = 1000 / TARGET_FPS;
  if (document.hidden) { last = 0; lastAnimated = 0; reportLive("fire", 0); schedule(); return; }
  if (last && stamp - last < period) { schedule(); return; }
  const dt = last ? Math.min((stamp - last) / 1000, 0.12) : 0;
  last = stamp;
  const still = reduced?.matches === true;
  const available = Math.min(budget, liveAllowance("fire"));   // never more than the other animated effects leave (4 on a Fire-only Wall, as before)
  let live = 0, frozen = 0;
  for (const entry of entries) {
    if (!entry.field || entry.field.pending || !entry.field.texture) continue;
    const animate = !still && entry.visible && live < available;
    if (animate) { live++; entry.time += dt * entry.fire.speed; times.set(entry.id, entry.time); drawEntry(entry, entry.time); }
    else { if (entry.visible) frozen++; if (entry.dirty || !entry.drawn) drawEntry(entry, still ? STILL_TIME : entry.time); }
  }
  reportLive("fire", live);
  if (live) adapt(stamp); else lastAnimated = 0;
  stats.frames++; stats.live = live; stats.still = frozen;
  schedule();
}
const schedule = () => { if (!rafId) rafId = requestAnimationFrame(loop); };

function unmount(entry) {
  entries.delete(entry);
  settle();
  observer?.unobserve(entry.canvas);
  releaseField(entry.next ?? entry.field);
  if (entry.interim) releaseField(entry.interim);
  entry.field = null; entry.next = null; entry.interim = null;
}

// mount(): canvas = the text's own 2D canvas (living-fire.js); spec = what the letters are; fire = validated settings; place(field) sizes / positions the canvas.
// Returns false when this device cannot draw Living Fire (the caller keeps the static fallback).
export function mount({ canvas, id, spec, fire, key, place, setState }) {
  if (!initGL()) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const entry = { canvas, ctx, id, spec, fire, key, place, setState, time: times.get(id) ?? STILL_TIME, born: performance.now(), seen: false, visible: true, dirty: true, drawn: false, field: null };
  canvas.__fire = entry;
  entries.add(entry);
  settle();
  observer?.observe(canvas);
  acquire(entry);
  if (!entry.field.pending) drawEntry(entry, reduced?.matches ? STILL_TIME : entry.time);   // a cached field draws at once: an editor repaint never flashes
  schedule();
  return true;
}

