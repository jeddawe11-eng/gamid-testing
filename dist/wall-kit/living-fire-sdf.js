// Living Fire V3 (Mazen's approved V3 package, GAMID_LIVING_INFERNO_V3): the signed distance field of the letters. The two functions below are copied VERBATIM from
// the package's dist/engine.js (exact separable squared Euclidean distance transform, lower-envelope method); buildSdf is the package's own rebuild() step that
// turns the two transforms into the capped signed field. It runs in a module Worker (this same file) so a visitor's page never computes it on the main thread;
// the engine falls back to calling buildSdf directly if a Worker cannot be started.
// Pro Effects (2026-10-25): the same exact transform also serves Living Radiation V1 (its package ships this file's code unchanged) and Living Ice V5 (the identical
// EDT, capped at 150 design units in its own 1920 x 800 frame): limit is the cap, 256 (V3's) unless a caller asks otherwise.
function edt1(f,n,d,v,z){let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;for(let q=1;q<n;q++){let s;do{s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);if(s<=z[k])k--;else break;}while(k>=0);k++;v[k]=q;z[k]=s;z[k+1]=Infinity;}k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;const x=q-v[k];d[q]=x*x+f[v[k]];}}
function distanceTransform(alpha,w,h,inside){const max=Math.max(w,h),f=new Float64Array(max),d=new Float64Array(max),v=new Int32Array(max),z=new Float64Array(max+1),grid=new Float32Array(w*h);for(let x=0;x<w;x++){for(let y=0;y<h;y++)f[y]=(alpha[(y*w+x)*4+3]>127)===inside?0:1e10;edt1(f,h,d,v,z);for(let y=0;y<h;y++)grid[y*w+x]=d[y];}for(let y=0;y<h;y++){for(let x=0;x<w;x++)f[x]=grid[y*w+x];edt1(f,w,d,v,z);for(let x=0;x<w;x++)grid[y*w+x]=d[x];}return grid;}

export const SDF_W = 1200, SDF_H = 640;   // the V3 design frame (DESIGN_W x DESIGN_H)
const cap = (n, a, b) => Math.max(a, Math.min(b, n));
// mask: RGBA bytes of the letters drawn white on transparent at SDF_W x SDF_H (alpha > 127 = inside). Returns the field the shader samples (R16F), in design units.
export function buildSdf(mask, w = SDF_W, h = SDF_H, limit = 256) {
  const toInside = distanceTransform(mask, w, h, true), toOutside = distanceTransform(mask, w, h, false);
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < sdf.length; i++) sdf[i] = cap(Math.sqrt(toOutside[i]) - Math.sqrt(toInside[i]), -limit, limit);
  return sdf;
}

// Worker entry: { id, mask (ArrayBuffer), w, h, limit? } -> { id, sdf (ArrayBuffer, transferred) }
if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope) {
  self.onmessage = event => {
    const { id, mask, w, h, limit = 256 } = event.data ?? {};
    try { const sdf = buildSdf(new Uint8ClampedArray(mask), w, h, limit); self.postMessage({ id, sdf: sdf.buffer }, [sdf.buffer]); }
    catch { self.postMessage({ id, sdf: null }); }
  };
}