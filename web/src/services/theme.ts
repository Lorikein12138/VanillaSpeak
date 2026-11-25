export type ThemeMode = "light" | "dark";

import { ref } from "vue";
import lightManifest from "../skins/builtin/light/manifest.json";
import lightCss from "../skins/builtin/light/skin.css?inline";
import darkManifest from "../skins/builtin/dark/manifest.json";
import darkCss from "../skins/builtin/dark/skin.css?inline";

const THEME_KEY = "webspeak:theme";
const SKIN_STYLE_ELEMENT_ID = "webspeak-active-built-in-skin";
const LIGHT_THEME_COLOR = "#F8F5ED";
const DARK_THEME_COLOR = "#181D1A";
export const hostTheme = ref<ThemeMode>("light");

const builtinSkins = {
  light: { manifest: lightManifest, css: lightCss },
  dark: { manifest: darkManifest, css: darkCss },
} as const;

export function getBuiltinSkinCss(theme: ThemeMode): string {
  return theme === "dark" ? builtinSkins.dark.css : builtinSkins.light.css;
}

export function getThemePreference(): ThemeMode | undefined {
  try {
    const choice = localStorage.getItem("webspeak:skin-choice");
    if (choice === "builtin.light" || choice === "builtin.dark") return choice === "builtin.dark" ? "dark" : "light";
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (stored === "system") return resolveLegacySystemTheme();
  } catch { /* Optional storage. */ }
}

export function resolveLegacySystemTheme(): ThemeMode {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): ThemeMode {
  return getThemePreference() ?? hostTheme.value;
}

export function applyTheme(theme: ThemeMode, options: { preserveCustomSkins?: boolean } = {}): void {
  hostTheme.value = theme;
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = isDarkTheme(theme);
  const activeSkin = isDarkTheme(theme) ? builtinSkins.dark : builtinSkins.light;

  // Keep data-theme for the admin console's independent appearance rules.
  // Built-in skin CSS is scoped to public roots and can never restyle /admin.
  root.dataset.theme = theme;
  if (root.style) root.style.colorScheme = dark ? "dark" : "light";
  if (typeof document.querySelector === "function" && typeof document.createElement === "function" && document.head) {
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.append(themeColor);
    }
    themeColor.content = dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  }
  document.querySelectorAll<HTMLElement>(".ws-skin-root").forEach((clientRoot) => {
    const currentSkin = clientRoot.dataset.wsSkin;
    const isCustomSkin = currentSkin !== builtinSkins.light.manifest.id && currentSkin !== builtinSkins.dark.manifest.id;
    if (options.preserveCustomSkins && currentSkin && isCustomSkin) return;
    clientRoot.dataset.wsSkin = activeSkin.manifest.id;
  });

  let style = document.getElementById(SKIN_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = SKIN_STYLE_ELEMENT_ID;
    style.dataset.skinPackage = activeSkin.manifest.id;
    document.head.append(style);
  }
  style.dataset.skinPackage = activeSkin.manifest.id;
  style.textContent = activeSkin.css;
}

export function saveTheme(theme: ThemeMode, options: { preserveCustomSkins?: boolean } = {}): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.removeItem("webspeak:skin-choice");
    if (!options.preserveCustomSkins) localStorage.removeItem("webspeak:third-party-skin:v2");
  } catch { /* Current page remains usable without storage. */ }
  applyTheme(theme, options);
}

export function isDarkTheme(theme: ThemeMode): boolean {
  return theme === "dark";
}

export function nextTheme(theme: ThemeMode): ThemeMode {
  return isDarkTheme(theme) ? "light" : "dark";
}

const initialPreference = getThemePreference();
if (initialPreference) saveTheme(initialPreference, { preserveCustomSkins: true });
else applyTheme("light");

if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === THEME_KEY || event.key === null) applyTheme(getThemePreference() ?? "light", { preserveCustomSkins: true });
});
