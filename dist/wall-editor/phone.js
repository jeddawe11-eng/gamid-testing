// Mobile Wall Editor V2 (2026-10-20): the one definition of "a phone" for the Wall Editor - portrait phones (below 600px wide) and landscape phones (below
// 900px wide and at most 500px tall). Tablets (600-899px wide and taller than 500px) and desktops (900px and wider) keep their own editor. editor-mobile.css
// is loaded with exactly this media query (index.html); a test keeps the two identical.
export const PHONE_QUERY = "(max-width: 599px), (max-width: 899px) and (max-height: 500px)";
export const isPhoneShell = () => typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches;
