// F8-B1 native check (opt-in: GAMID_NATIVE_FFMPEG=1 and an FFmpeg with libvmaf): the REAL plan -> encode -> validation -> audio packet hashes -> VMAF -> gate on
// synthetic 4K sources (landscape with AAC audio, rotated portrait, and one already so small that the savings gate must refuse it). Nothing is uploaded.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeMedia, renditionPlan, renditionArgs, validateRendition, measureVmaf, audioHashes, renditionGate, hasVmaf } from "../worker/wall-rendition.mjs";
import { topLevelBoxes } from "../worker/wall-video.mjs";

const enabled = process.env.GAMID_NATIVE_FFMPEG === "1";
const ff = args => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args]);

test("F8-B1 native: real sources -> verified 1080p renditions (audio bit-identical, rotation applied); real quality and savings refusals", { skip: !enabled && "set GAMID_NATIVE_FFMPEG=1 (needs ffmpeg + ffprobe with libvmaf)" }, async () => {
  assert.equal(await hasVmaf(), true, "this FFmpeg has libvmaf (the worker refuses renditions without it)");
  const dir = mkdtempSync(join(tmpdir(), "gamid-f8b1-native-"));
  try {
    const run = async (name, makeArgs) => {
      const input = join(dir, `${name}.mp4`), output = join(dir, `${name}.rendition.mp4`);
      ff(makeArgs(input));
      const plan = renditionPlan(await probeMedia(input));
      assert.equal(plan.ok, true, name);
      execFileSync("ffmpeg", renditionArgs(input, output, plan));
      validateRendition(plan, await probeMedia(output), await topLevelBoxes(output));
      const [before, after] = [await audioHashes(input), await audioHashes(output)];
      const vmaf = await measureVmaf(input, output, plan, dir);
      const gate = renditionGate({ vmaf, bytes: statSync(output).size, sourceBytes: statSync(input).size, frames: vmaf.frames, plan });
      return { plan, before, after, vmaf, gate, sizes: [statSync(input).size, statSync(output).size] };
    };
    // camera-like (softened) moving content with game audio: passes
    const landscape = await run("landscape", out => ["-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30,gblur=sigma=3", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-c:a", "aac", "-b:a", "128k", out]);
    assert.deepEqual(landscape.plan.target, [1920, 1080]);
    assert.equal(landscape.before.length, 1);
    assert.deepEqual(landscape.after, landscape.before, "the game audio is copied packet for packet");
    assert.deepEqual(landscape.gate, { ok: true }, JSON.stringify({ vmaf: landscape.vmaf, sizes: landscape.sizes }));
    // a razor-sharp synthetic pattern (text, 1-px edges) loses detail at CRF 23 / 1080p: the REAL gate refuses it and the original stays
    const sharp = await run("sharp", out => ["-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30", "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", out]);
    assert.equal(sharp.gate.code, "QUALITY_GATE", JSON.stringify({ vmaf: sharp.vmaf, sizes: sharp.sizes }));
    const portrait = await run("portrait", out => ["-display_rotation", "90", "-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30,gblur=sigma=3", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", out]);
    assert.deepEqual(portrait.plan.target, [1080, 1920], "rotation applied before fitting");
    assert.equal(portrait.vmaf.frames, portrait.plan.frames);
    assert.ok(portrait.vmaf.mean >= 95, JSON.stringify(portrait.vmaf));
    // a source already encoded the way the rendition would be (1080p, CRF 23 slow): re-encoding cannot save 25%, so the REAL gate refuses it
    const efficient = await run("efficient", out => ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30,gblur=sigma=3", "-t", "3", "-c:v", "libx264", "-preset", "slow", "-crf", "23", out]);
    assert.equal(efficient.gate.code, "INSUFFICIENT_SAVINGS", JSON.stringify({ vmaf: efficient.vmaf, sizes: efficient.sizes }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
