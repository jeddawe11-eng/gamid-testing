// F8-A (Mazen's authorization 2026-10-21): a new MP4 Wall video whose moov comes after its media is uploaded fast start - a lossless remux in the owner's browser
// (moov moved before the first mdat, only stco / co64 entries shifted), verified from the candidate's own bytes; anything unprovable is uploaded unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareFaststartUpload, readMoovTables } from "../dist/account/mp4-faststart.js";

// ---- a tiny ISO-BMFF writer -------------------------------------------------------------------------------------------------------------------------
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const u32 = n => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const u64 = n => cat(u32(Math.floor(n / 2 ** 32)), u32(n >>> 0));
const str = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
const box = (type, ...parts) => { const body = cat(...parts); return cat(u32(8 + body.length), str(type), body); };
const full = (type, ...parts) => box(type, u32(0), ...parts);

// Two tracks over one mdat: track 1 = 6 samples in 3 chunks (stco), track 2 = 4 samples in 2 chunks (co64 when wide). Chunks interleave inside the mdat.
function sampleMp4({ moovFirst = false, wide = false, dref = box("url ", u32(1)), extraMoov = new Uint8Array(0), top = [], stsc2 = null } = {}) {
  const sizes1 = [10, 11, 12, 13, 14, 15], sizes2 = [7, 8, 9, 10];
  const fill = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (seed * 31 + i * 7) & 255);
  const c1 = [cat(fill(sizes1[0], 1), fill(sizes1[1], 2)), cat(fill(sizes1[2], 3), fill(sizes1[3], 4)), cat(fill(sizes1[4], 5), fill(sizes1[5], 6))];
  const c2 = [cat(fill(7, 7), fill(8, 8)), cat(fill(9, 9), fill(10, 10))];
  const order = [c1[0], c2[0], c1[1], c2[1], c1[2]];
  const payload = cat(...order);
  const build = mdatAt => {
    let at = mdatAt + 8;
    const where = order.map(chunk => { const o = at; at += chunk.length; return o; });
    const off1 = [where[0], where[2], where[4]], off2 = [where[1], where[3]];
    const drefBox = full("dref", u32(1), dref);
    const trak = (offsets, sizes, co64, stscRuns) => box("trak", full("tkhd", new Uint8Array(80)), box("mdia", full("mdhd", new Uint8Array(20)), full("hdlr", u32(0), str("vide"), new Uint8Array(13)),
      box("minf", box("dinf", drefBox), box("stbl", full("stsd", u32(0)), full("stts", u32(0)),
        full("stsc", u32(stscRuns.length), ...stscRuns.flatMap(([first, per]) => [u32(first), u32(per), u32(1)])),
        full("stsz", u32(0), u32(sizes.length), ...sizes.map(u32)),
        co64 ? full("co64", u32(offsets.length), ...offsets.map(u64)) : full("stco", u32(offsets.length), ...offsets.map(u32))))));
    return box("moov", full("mvhd", new Uint8Array(96)), trak(off1, sizes1, false, [[1, 2]]), trak(off2, sizes2, wide, stsc2 ?? [[1, 2]]), extraMoov);
  };
  const ftyp = box("ftyp", str("isom"), u32(512), str("isomavc1")), free = box("free", new Uint8Array(4));
  const head = cat(ftyp, free, ...top);
  if (moovFirst) { const size = build(0).length; return { bytes: cat(head, build(head.length + size), box("mdat", payload)), mdat: box("mdat", payload) }; }
  return { bytes: cat(head, box("mdat", payload), build(head.length)), mdat: box("mdat", payload) };
}
const asFile = bytes => new File([bytes], "clip.mp4", { type: "video/mp4" });
const topTypes = b => { const t = []; for (let at = 0; at < b.length;) { const s = ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3]; t.push(String.fromCharCode(...b.subarray(at + 4, at + 8))); at += s; } return t; };
// the media bytes of every chunk, read through the file's OWN tables
const media = b => { const at = topTypes(b).indexOf("moov"); let o = 0; for (let i = 0; i < at; i += 1) o += ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const size = ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  return readMoovTables(b.subarray(o, o + size)).tracks.map(chunks => chunks.map(({ offset, length }) => [...b.subarray(offset, offset + length)].join(","))); };

test("F8-A a moov-at-end MP4 becomes fast start: same size, moov before mdat, every chunk of every track (stco and co64) the same bytes, nothing else changed", async () => {
  for (const wide of [false, true]) {
    const { bytes, mdat } = sampleMp4({ wide });
    assert.deepEqual(topTypes(bytes), ["ftyp", "free", "mdat", "moov"]);
    const { blob, result } = await prepareFaststartUpload(asFile(bytes));
    assert.equal(result, "faststart");
    const out = new Uint8Array(await blob.arrayBuffer());
    assert.equal(out.length, bytes.length);
    assert.equal(blob.type, "video/mp4");
    assert.deepEqual(topTypes(out), ["ftyp", "free", "moov", "mdat"]);
    assert.deepEqual(media(out), media(bytes), "stream identity through each file's own tables");
    assert.deepEqual([...out.subarray(out.length - mdat.length)], [...mdat], "the whole mdat box is byte-identical, now at the end");
  }
});

test("F8-A an MP4 that is already fast start, and every WebM, is uploaded exactly as chosen", async () => {
  const { bytes } = sampleMp4({ moovFirst: true });
  const file = asFile(bytes);
  const prepared = await prepareFaststartUpload(file);
  assert.equal(prepared.result, "already");
  assert.equal(prepared.blob, file, "the very same File object");
  const client = readFileSync(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
  assert.match(client, /const upload = extension === "mp4" \? \(await prepareFaststartUpload\(file\)\)\.blob : file;/);
  assert.match(client, /bucketName: "wall-video", objectName: path, contentType: file\.type, file: upload,/);
});

test("F8-A anything that cannot be proven safe is uploaded unchanged (never an error, never a partial rewrite)", async () => {
  const cases = {
    external_data: sampleMp4({ dref: box("url ", u32(0)) }).bytes,                         // media in another file (flag 0)
    box_saio: sampleMp4({ extraMoov: box("trak", box("mdia", box("minf", box("stbl", full("saio", u32(0)))))) }).bytes,
    box_mvex: sampleMp4({ extraMoov: box("mvex", full("trex", new Uint8Array(20))) }).bytes,   // fragmented
    box_iloc: sampleMp4({ extraMoov: full("meta", full("hdlr", new Uint8Array(20)), full("iloc", new Uint8Array(8))) }).bytes,
    tables: sampleMp4({ stsc2: [[1, 3]] }).bytes,                                              // samples-per-chunk inconsistent with stsz
    top_sidx: sampleMp4({ top: [box("sidx", new Uint8Array(24))] }).bytes,
    not_mp4: cat(box("abcd", new Uint8Array(20)), box("mdat", new Uint8Array(8))),
  };
  for (const [reason, bytes] of Object.entries(cases)) {
    const file = asFile(bytes);
    const prepared = await prepareFaststartUpload(file);
    assert.equal(prepared.result, "unchanged", reason);
    assert.equal(prepared.reason, reason);
    assert.equal(prepared.blob, file);
  }
  // truncated / oversized
  const { bytes } = sampleMp4();
  assert.equal((await prepareFaststartUpload(asFile(bytes.subarray(0, bytes.length - 3)))).result, "unchanged");
  assert.equal((await prepareFaststartUpload({ size: 60 * 1024 * 1024, type: "video/mp4" })).reason, "size");
  assert.equal((await prepareFaststartUpload(null)).result, "unchanged");
});

test("F8-A a chunk offset outside the media regions, or a chunk running across the old moov, leaves the file unchanged", async () => {
  const { bytes } = sampleMp4();
  // point track 1's first chunk into the ftyp (before the first mdat)
  const bad = bytes.slice();
  const stco = (() => { for (let i = 0; i + 4 < bad.length; i += 1) if (String.fromCharCode(...bad.subarray(i, i + 4)) === "stco") return i + 4 + 4 + 4; return -1; })();
  bad.set(u32(4), stco);
  assert.equal((await prepareFaststartUpload(asFile(bad))).reason, "offset_outside_media");
  // track 1's last sample claims 400 bytes: its chunk (the last one in the mdat) would run into the old moov
  const across = bytes.slice();
  const stsz = (() => { for (let i = 0; i + 4 < across.length; i += 1) if (String.fromCharCode(...across.subarray(i, i + 4)) === "stsz") return i + 16; return -1; })();
  across.set(u32(400), stsz + 5 * 4);
  assert.equal((await prepareFaststartUpload(asFile(across))).reason, "chunk_across_moov");
});

test("F8-A fuzz: random damage to the moov never throws, never uploads a candidate that fails stream identity", async () => {
  const { bytes } = sampleMp4({ wide: true });
  const types = topTypes(bytes);
  let o = 0; for (let i = 0; i < types.indexOf("moov"); i += 1) o += ((bytes[o] << 24) >>> 0) + (bytes[o + 1] << 16) + (bytes[o + 2] << 8) + bytes[o + 3];
  let seed = 12345;
  const rand = n => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  for (let round = 0; round < 300; round += 1) {
    const damaged = bytes.slice();
    for (let k = 0; k < 1 + rand(3); k += 1) damaged[o + 8 + rand(bytes.length - o - 8)] = rand(256);
    const file = asFile(damaged);
    const prepared = await prepareFaststartUpload(file);
    assert.ok(["faststart", "unchanged"].includes(prepared.result));
    if (prepared.result === "faststart") {
      const out = new Uint8Array(await prepared.blob.arrayBuffer());
      assert.equal(out.length, damaged.length);
      assert.deepEqual(media(out), media(damaged));
    } else assert.equal(prepared.blob, file);
  }
});
