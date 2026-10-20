// F8-A (Mazen's authorization 2026-10-21): a NEW MP4 Wall video whose index (`moov`) sits after its media (`mdat`) is made "fast start" in the owner's own browser
// before it is uploaded. This is a lossless REMUX, not an encode: the `moov` box moves in front of the first `mdat`, and only its chunk-offset tables (stco / co64)
// change, by exactly the size of the moved box. Every video and audio packet, every track, all metadata and the file size stay the same; nothing is re-encoded,
// scaled or dropped. The candidate is then checked INDEPENDENTLY, from its own bytes: its box layout, its own tables (every chunk of every track compared byte for byte
// with the original's), every moov byte outside the offset tables, and every byte outside the moov. Only those verified bytes are uploaded. A file that is already fast
// start is uploaded unchanged; so is any file this code cannot prove safe (fragmented, encrypted, external data, item locations, an unusual layout, a read error).
// Existing stored files are never touched here, and the server's checks (wall-asset-register) are unchanged.

export const FASTSTART_LIMITS = Object.freeze({ maxBytes: 50 * 1024 * 1024, maxMoovBytes: 8 * 1024 * 1024, maxTopLevelBoxes: 256, maxDepth: 16 });
// top-level boxes that never hold a byte offset; anything else (moof, sidx, mfra, styp, meta...) leaves the file unchanged
const TOP_LEVEL = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide", "uuid", "pdin"]);
// containers walked inside the moov; boxes that carry absolute offsets other than stco / co64, or mean fragments / encryption, leave the file unchanged
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts", "udta", "tref"]);
const REFUSE = new Set(["mvex", "moof", "saio", "saiz", "senc", "iloc", "sidx", "ssix", "mfra", "stz2"]);

const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u64 = (b, i) => u32(b, i) * 2 ** 32 + u32(b, i + 4);
const type4 = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
class Unsafe extends Error {}
const refuse = reason => { throw new Unsafe(reason); };

// The top-level boxes: [{ type, at, size }] covering the file exactly; read(offset, length) -> Uint8Array.
async function topBoxes(read, total) {
  const out = [];
  for (let at = 0; at < total;) {
    if (out.length >= FASTSTART_LIMITS.maxTopLevelBoxes || at + 8 > total) refuse("layout");
    const head = await read(at, Math.min(16, total - at));
    let size = u32(head, 0);
    const type = type4(head, 4);
    if (size === 1) { if (head.length < 16) refuse("layout"); size = u64(head, 8); }
    else if (size === 0) size = total - at;
    if (size < 8 || at + size > total || !Number.isSafeInteger(size)) refuse("layout");
    out.push({ type, at, size, open: u32(head, 0) === 0 });
    at += size;
  }
  return out;
}

// The boxes directly inside b[start, end): [{ type, start (payload), end }]
function children(b, start, end) {
  const out = [];
  for (let at = start; at < end;) {
    if (at + 8 > end) refuse("moov");
    let size = u32(b, at), header = 8;
    if (size === 1) { if (at + 16 > end) refuse("moov"); size = u64(b, at + 8); header = 16; }
    else if (size === 0) size = end - at;
    if (size < header || at + size > end) refuse("moov");
    out.push({ type: type4(b, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return out;
}

// Every track's chunk table, and every offset entry, of a whole moov box `m` (header included). -> { tables: [{ wide, at, count }], tracks: [[{ offset, length }]] }
export function readMoovTables(m) {
  if (type4(m, 4) !== "moov") refuse("moov");
  const top = children(m, 0, m.length)[0];
  const tables = [], tracks = [];
  const walk = (box, depth) => {
    if (depth > FASTSTART_LIMITS.maxDepth) refuse("moov");
    const kids = children(m, box.start, box.end);
    for (const kid of kids) {
      if (REFUSE.has(kid.type)) refuse(`box_${kid.type}`);
      // a `meta` box may hold item locations (iloc = absolute offsets): any trace of one leaves the file unchanged
      if (kid.type === "meta") { for (let i = kid.start; i + 4 <= kid.end; i += 1) if (m[i] === 0x69 && type4(m, i) === "iloc") refuse("box_iloc"); continue; }
      if (kid.type === "dref") checkDref(kid);
      if (kid.type === "stbl") { tracks.push(chunkTable(kid)); continue; }
      if (CONTAINERS.has(kid.type)) walk(kid, depth + 1);
    }
  };
  // every data reference must be "self-contained" (flag 1): media in another file would not move with this one
  const checkDref = box => {
    if (box.end - box.start < 8) refuse("dref");
    for (const entry of children(m, box.start + 8, box.end)) if (entry.end - entry.start < 4 || !(m[entry.start + 3] & 1)) refuse("external_data");
  };
  const chunkTable = stbl => {
    const kids = children(m, stbl.start, stbl.end);
    for (const kid of kids) if (REFUSE.has(kid.type)) refuse(`box_${kid.type}`);
    const find = type => kids.filter(kid => kid.type === type);
    const offsets = [...find("stco"), ...find("co64")], stsc = find("stsc"), stsz = find("stsz");
    if (offsets.length !== 1 || stsc.length !== 1 || stsz.length !== 1) refuse("tables");
    const table = offsets[0], wide = table.type === "co64", count = table.end - table.start >= 8 ? u32(m, table.start + 4) : -1;
    if (count < 0 || table.start + 8 + count * (wide ? 8 : 4) > table.end) refuse("tables");
    tables.push({ wide, at: table.start + 8, count });
    // sample sizes
    const z = stsz[0];
    if (z.end - z.start < 12) refuse("tables");
    const uniform = u32(m, z.start + 4), samples = u32(m, z.start + 8);
    if (!uniform && z.start + 12 + samples * 4 > z.end) refuse("tables");
    const sizeOf = n => (uniform || u32(m, z.start + 12 + n * 4));
    // samples per chunk
    const c = stsc[0];
    if (c.end - c.start < 8) refuse("tables");
    const runs = u32(m, c.start + 4);
    if (c.start + 8 + runs * 12 > c.end || (count > 0 && runs < 1)) refuse("tables");
    const chunks = [];
    let sample = 0;
    for (let r = 0; r < runs; r += 1) {
      const first = u32(m, c.start + 8 + r * 12), per = u32(m, c.start + 12 + r * 12);
      const next = r + 1 < runs ? u32(m, c.start + 8 + (r + 1) * 12) : count + 1;
      if (first < 1 || next <= first || next > count + 1 || (r === 0 && first !== 1)) refuse("tables");
      for (let chunk = first; chunk < next; chunk += 1) {
        if (sample + per > samples) refuse("tables");
        let length = 0;
        for (let k = 0; k < per; k += 1) length += sizeOf(sample + k);
        sample += per;
        const at = table.start + 8 + (chunk - 1) * (wide ? 8 : 4);
        chunks.push({ offset: wide ? u64(m, at) : u32(m, at), length });
      }
    }
    if (chunks.length !== count || sample !== samples) refuse("tables");
    return chunks;
  };
  walk(top, 0);
  if (!tracks.length) refuse("no_tracks");
  return { tables, tracks };
}

const same = (a, aAt, b, bAt, length) => { for (let i = 0; i < length; i += 1) if (a[aAt + i] !== b[bAt + i]) return false; return true; };
const blobReader = blob => async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());

// -> { blob, result: "faststart" | "already" | "unchanged", reason? }. Never throws: on any doubt the original file is returned.
export async function prepareFaststartUpload(file) {
  try {
    const total = file?.size;
    if (!Number.isSafeInteger(total) || total < 16 || total > FASTSTART_LIMITS.maxBytes) return { blob: file, result: "unchanged", reason: "size" };
    const top = await topBoxes(blobReader(file), total);
    if (top[0]?.type !== "ftyp") refuse("not_mp4");
    const moovs = top.filter(box => box.type === "moov"), firstMdat = top.findIndex(box => box.type === "mdat");
    if (moovs.length !== 1 || firstMdat < 0) refuse("layout");
    const moovIndex = top.indexOf(moovs[0]), moov = moovs[0];
    if (moovIndex < firstMdat) return { blob: file, result: "already" };
    for (const box of top) if (!TOP_LEVEL.has(box.type)) refuse(`top_${box.type}`);
    if (moov.open || moov.size > FASTSTART_LIMITS.maxMoovBytes) refuse("moov_size");

    // 1. the candidate: [everything before the first mdat] [moov, offsets moved] [the first mdat ... up to the old moov] [everything after the old moov]
    const original = new Uint8Array(await file.arrayBuffer());
    if (original.length !== total) refuse("read");
    const insert = top[firstMdat].at, moovStart = moov.at, moovEnd = moov.at + moov.size, delta = moov.size;
    const moovBytes = original.slice(moovStart, moovEnd);
    const before = readMoovTables(moovBytes);
    const patched = moovBytes.slice();
    const view = new DataView(patched.buffer);
    for (const table of before.tables) {
      for (let n = 0; n < table.count; n += 1) {
        const at = table.at + n * (table.wide ? 8 : 4);
        const offset = table.wide ? u64(patched, at) : u32(patched, at);
        let moved;
        if (offset >= insert && offset < moovStart) moved = offset + delta;
        else if (offset >= moovEnd && offset < total) moved = offset;
        else refuse("offset_outside_media");
        if (table.wide) { view.setUint32(at, Math.floor(moved / 2 ** 32)); view.setUint32(at + 4, moved >>> 0); }
        else { if (moved > 0xffffffff) refuse("offset_overflow"); view.setUint32(at, moved); }
      }
    }
    // a chunk must lie wholly inside one moved or unmoved region (never across the old moov)
    for (const chunks of before.tracks) for (const { offset, length } of chunks) {
      const end = offset + length;
      if (!((offset >= insert && end <= moovStart) || (offset >= moovEnd && end <= total))) refuse("chunk_across_moov");
    }
    const candidate = new Uint8Array(total);
    candidate.set(original.subarray(0, insert), 0);
    candidate.set(patched, insert);
    candidate.set(original.subarray(insert, moovStart), insert + delta);
    candidate.set(original.subarray(moovEnd), moovEnd);

    // 2. independent verification of the candidate, from its own bytes
    const layout = await topBoxes(async (offset, length) => candidate.subarray(offset, offset + length), total);
    const expected = top.filter(box => box !== moov).map(box => box.type);
    expected.splice(firstMdat, 0, "moov");
    if (layout.map(box => box.type).join("/") !== expected.join("/")) refuse("verify_layout");
    const newMoov = layout.find(box => box.type === "moov");
    if (newMoov.at !== insert || newMoov.size !== delta || layout.findIndex(box => box.type === "moov") > layout.findIndex(box => box.type === "mdat")) refuse("verify_layout");
    const after = readMoovTables(candidate.subarray(insert, insert + delta));
    if (after.tracks.length !== before.tracks.length) refuse("verify_tracks");
    // every chunk of every track: the same length, and the same bytes, at the candidate's own offsets
    for (let t = 0; t < before.tracks.length; t += 1) {
      const a = before.tracks[t], b = after.tracks[t];
      if (a.length !== b.length) refuse("verify_tracks");
      for (let n = 0; n < a.length; n += 1) {
        if (a[n].length !== b[n].length || b[n].offset + b[n].length > total || !same(original, a[n].offset, candidate, b[n].offset, a[n].length)) refuse("verify_media");
      }
    }
    // every moov byte outside the offset entries is unchanged (metadata, sample tables, codec configuration...)
    const entry = new Uint8Array(delta);
    for (const table of after.tables) entry.fill(1, table.at, table.at + table.count * (table.wide ? 8 : 4));
    for (let i = 0; i < delta; i += 1) if (!entry[i] && candidate[insert + i] !== moovBytes[i]) refuse("verify_moov");
    // every byte outside the moov is the original's, in its new place
    if (!same(original, 0, candidate, 0, insert) || !same(original, insert, candidate, insert + delta, moovStart - insert) || !same(original, moovEnd, candidate, moovEnd, total - moovEnd)) refuse("verify_bytes");

    return { blob: new Blob([candidate], { type: file.type }), result: "faststart" };
  } catch (error) {
    return { blob: file, result: "unchanged", reason: error instanceof Unsafe ? error.message : "error" };
  }
}
