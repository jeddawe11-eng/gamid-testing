// GAME ID WALL - W0 PROTOTYPE - sample asset manifest and hard-coded sample media. Nothing here is user data.
export const ASSETS = Object.freeze({
  wallArt:   Object.freeze({ file: "assets/wall-art.png",   w: 720,  h: 3840, alt: "Continuous sample Wall art" }),
  stageAlt:  Object.freeze({ file: "assets/stage-alt.png",  w: 720,  h: 1280, alt: "Per-stage override art" }),
  character: Object.freeze({ file: "assets/character.png",  w: 640,  h: 960,  alt: "Transparent sample character cut-out" }),
  photo:     Object.freeze({ file: "assets/photo.png",      w: 800,  h: 450,  alt: "Sample screenshot" }),
  frame:     Object.freeze({ file: "assets/frame.png",      w: 1000, h: 600,  alt: "Decorative frame plate" }),
});

// Hard-coded W0 sample media (verified embeddable through the providers' official oEmbed endpoints). No user URLs exist in W0.
export const SAMPLE_MEDIA = Object.freeze({
  youtube: Object.freeze({ provider: "youtube", kind: "video", id: "aqz-KE-bpKQ", label: "Sample video (Blender Foundation short film)" }),
  spotifyPlaylist: Object.freeze({ provider: "spotify", kind: "playlist", id: "37i9dQZF1DXcBWIGoYBM5M", label: "Sample playlist" }),
  spotifyTrack: Object.freeze({ provider: "spotify", kind: "track", id: "4cOdK2wGLETKBW3PvgPWqT", label: "Sample track" }),
});

// Sample GamID "live-data" blocks. The values are FAKE and hard-coded; the block is one indivisible logical element.
export const BLOCKS = Object.freeze({
  "league.rank": Object.freeze({ label: "League rank (sample)", w: 560, h: 230 }),
  "identity.card": Object.freeze({ label: "Identity card (sample)", w: 620, h: 240 }),
});

export const FONT_LABELS = Object.freeze({ orbitron: "Orbitron", bebas: "Bebas Neue", russo: "Russo One", rajdhani: "Rajdhani", chakra: "Chakra Petch" });
