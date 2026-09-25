// Importing this module registers every Wall element type, background kind and embed provider that the Wall kit provides with the Wall core's registries. Anything
// that validates, edits, paints or persists a Wall imports it (directly or through ops.js / paint.js), so a document is judged by the same rules everywhere.
import "./text.js";
import "./image.js";
import "./background.js";
import "./gamid.js";
import "./embed/index.js";
