// Wall background video - resolution-preservation acceptance, run by hand on a LOCAL file (media is never committed):
//   node scripts/wall-video-acceptance.mjs <hevc-source.mp4> <output.mp4>
// Runs the worker's own conversion (worker/wall-video.mjs), then inspects BOTH files with ffprobe independently and prints PASS only when the output is H.264
// and input_width == output_width AND input_height == output_height. Any resolution change is a FAILURE (exit code 1).
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { transcodeWallBackground } from "../worker/wall-video.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("Usage: node scripts/wall-video-acceptance.mjs INPUT OUTPUT"); process.exit(2); }
const facts = path => {
  const data = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,level,width,height,pix_fmt,avg_frame_rate,nb_frames,sample_aspect_ratio:format=duration,size", "-of", "json", path]).toString());
  const audio = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path]).toString().trim();
  return { ...data.streams[0], duration: Number(data.format.duration), bytes: Number(data.format.size), audioStreams: audio ? audio.split(/\s+/).length : 0 };
};
const started = Date.now();
await transcodeWallBackground(input, output);
const elapsed = (Date.now() - started) / 1000;
const before = facts(input), after = facts(output);
const pass = after.codec_name === "h264" && before.width === after.width && before.height === after.height;
console.log(JSON.stringify({ input: before, output: after, elapsedSeconds: elapsed, sourceBytes: statSync(input).size, outputBytes: statSync(output).size,
  resolution: `${before.width}x${before.height} -> ${after.width}x${after.height}`, result: pass ? "PASS" : "FAIL" }, null, 2));
process.exit(pass ? 0 : 1);
