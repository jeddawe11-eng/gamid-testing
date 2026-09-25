// Small, type-neutral field checks shared by every element type that wants them (built-ins here and element types registered from other modules). They are
// the vocabulary of "a bounded finite number", "a #rrggbb colour" and "a two-stop gradient" - nothing here knows about any specific element type.
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// "Absent" means undefined or JSON null: an optional field is simply not set.
export const isSet = value => value !== undefined && value !== null;
export const isPlainObject = value => !!value && typeof value === "object" && !Array.isArray(value);
export const isHex = value => typeof value === "string" && HEX_COLOR.test(value);
export const inRange = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

// Two-stop linear gradient: { from: #rrggbb, to: #rrggbb, angle: 0..360 degrees }.
export const isGradient = value => isPlainObject(value) && isHex(value.from) && isHex(value.to) && inRange(value.angle, 0, 360);
