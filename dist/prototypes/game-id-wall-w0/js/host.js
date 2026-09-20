// GAME ID WALL - W0 PROTOTYPE - hosting shape B outer page. It only frames wall-view.html and varies the permissions it delegates,
// so the nested YouTube / Spotify behaviour (fullscreen, autoplay, playsinline, scrolling, touch) can be compared with shape A.
const frame = document.getElementById("wallFrame"), controls = document.getElementById("hostControls");
const DELEGATE = {
  full: "fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write",
  current: "fullscreen",
  none: "",
};
const q = new URLSearchParams(location.search);
let mode = DELEGATE[q.get("delegate")] !== undefined ? q.get("delegate") : "full";

function apply() {
  const src = new URL("wall-view.html", location.href);
  src.searchParams.set("embedded", "1");
  for (const key of ["col", "contain", "wall", "intro", "diag"]) if (q.has(key)) src.searchParams.set(key, q.get(key));
  frame.setAttribute("allow", DELEGATE[mode]);
  if (mode !== "none") frame.setAttribute("allowfullscreen", ""); else frame.removeAttribute("allowfullscreen");
  frame.setAttribute("src", src.href);
  controls.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
}
for (const [key, label] of [["full", "Full delegation"], ["current", "Fullscreen only"], ["none", "None"]]) {
  const b = document.createElement("button"); b.type = "button"; b.className = "pbtn"; b.textContent = label; b.dataset.mode = key;
  b.addEventListener("click", () => { mode = key; apply(); });
  controls.append(b);
}
apply();
