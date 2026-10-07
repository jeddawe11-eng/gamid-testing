// Removing src + load aborts native buffering; pause alone does not.
export function releaseIntroConsumers(video, clones = []) {
  for (const v of [video, ...clones]) {
    if (!v) continue;
    v.onended = null; v.onerror = null;
    v.pause(); v.removeAttribute("src"); v.load();
  }
  for (const clone of clones) clone.remove();
}
