import { readFile, access } from "node:fs/promises";
// The Slice 1 Intro lab now lives outside the deployed site (see prototypes/slice-1-intro-lab/README.md).
const html = await readFile(new URL("../prototypes/slice-1-intro-lab/index.html", import.meta.url), "utf8");
const landing = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
const accountHtml = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const accountCss = await readFile(new URL("../dist/account/account.css", import.meta.url), "utf8");
const accountClient = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
for (const required of ["introVideo","introImage","presetSelect","replayButton","skipButton"]) {
  if (!html.includes(`id=\"${required}\"`)) throw new Error(`Missing ${required}`);
}
for (const preset of ["preset-fade","preset-blur","preset-shrink","preset-slide","preset-split"]) {
  if (!css.includes(preset)) throw new Error(`Missing ${preset}`);
}
for (const behavior of ["body.is-experiencing", ".is-experiencing .intro-layer", ".is-experiencing .controls"]) {
  if (!css.includes(behavior)) throw new Error(`Missing immersive behavior: ${behavior}`);
}
if (!css.includes('.experience[data-state="profile"] .preset-shrink{background:transparent')) {
  throw new Error("Shrink preset must keep the profile-state overlay transparent");
}
if (!html.includes('id="avatarTarget"') || !css.includes("--shrink-x")) {
  throw new Error("Shrink preset must target the runtime avatar position");
}
if (!html.includes('<source src="../../dist/assets/gamid-intro.mp4" type="video/mp4"')) {
  throw new Error("Intro must retain the deferred MP4 source reference");
}
await access(new URL("../dist/assets/gamid-intro-poster.webp", import.meta.url));
for (const required of ["registerForm","signinForm","forgotForm","recoveryForm","onboardingForm","identityView","signOutButton"]) {
  if (!accountHtml.includes(`id=\"${required}\"`)) throw new Error(`Missing Slice 2 control: ${required}`);
}
if (!accountCss.includes("@media(min-width:760px)") || !accountCss.includes("min-width:320px")) {
  throw new Error("Account flow must include mobile-first responsive styles");
}
if (!accountClient.includes("sb_publishable_") || accountClient.includes("service_role")) {
  throw new Error("Frontend must use only a Supabase publishable key");
}
for (const required of ["account/?auth=register", "account/?auth=signin", "landing.css"]) {
  if (!landing.includes(required)) throw new Error(`Landing page is missing ${required}`);
}
if (/<script|<form|<input|presetSelect|novarift/i.test(landing)) throw new Error("The public root must be a static landing page: no scripts, forms, or prototype content");
console.log("Static prototype validation passed.");
