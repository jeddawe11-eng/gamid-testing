import { readFile, access } from "node:fs/promises";
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
for (const required of ["introVideo","introImage","presetSelect","replayButton","skipButton"]) {
  if (!html.includes(`id=\"${required}\"`)) throw new Error(`Missing ${required}`);
}
for (const preset of ["preset-fade","preset-blur","preset-shrink","preset-slide","preset-split"]) {
  if (!css.includes(preset)) throw new Error(`Missing ${preset}`);
}
await access(new URL("../dist/assets/gamid-intro.mp4", import.meta.url));
await access(new URL("../dist/assets/gamid-intro-poster.webp", import.meta.url));
console.log("Static prototype validation passed.");
