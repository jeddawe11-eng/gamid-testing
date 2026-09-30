export const VOICE_PROVIDER_KEYS = Object.freeze(["discord"]);

export function voiceProvider(registry, key) {
  if (!VOICE_PROVIDER_KEYS.includes(key) || !registry?.[key]) throw new Error("VOICE_PROVIDER_UNSUPPORTED");
  const provider = registry[key];
  for (const method of ["ensureParticipant", "ensureSession", "joinTarget", "endSession"]) {
    if (typeof provider[method] !== "function") throw new Error("VOICE_PROVIDER_INVALID");
  }
  return provider;
}
