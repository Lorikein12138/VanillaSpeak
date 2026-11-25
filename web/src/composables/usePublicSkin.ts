import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { RETIRED_KAAK_ID } from "../../../src/shared/skin-catalog.js";
import { OFFICIAL_SKIN_IDS, setInstanceAuthorization, thirdPartyAllowed } from "../services/instance-authorization.js";
import { listInstalledSkins, loadLocalPreferences, saveInstalledSkin, saveLocalPreferences } from "../services/local-persistence.js";
import { BUILTIN_SKIN_CATALOG, getPublicDefaultSkinId, listPublicSkins, type SkinCatalogEntry } from "../services/skin-catalog.js";
import { activateSkin, BUILTIN_DARK_SKIN, BUILTIN_LIGHT_SKIN, clearCustomSkinStyle, storeSkinId } from "../services/skin-runtime.js";
import { createSkinOperation } from "../services/skin-operation.js";
import { setSkinHostChromeParts, setHostChromeActiveSkin, hostBuiltInSkinRequests } from "../services/host-chrome.js";
import { applyTheme, getThemePreference, hostTheme, resolveLegacySystemTheme, saveTheme, type ThemeMode } from "../services/theme.js";
import type { InstalledSkin } from "../services/skin-pack.js";

interface PublicSkinOptions {
  activeSkin?: Ref<InstalledSkin | null>;
  appVersion?: () => string;
  timeoutMs?: number;
}

const customChoiceKey = "webspeak:third-party-skin:v2";
const builtInId = (theme = hostTheme.value) => theme === "dark" ? BUILTIN_DARK_SKIN : BUILTIN_LIGHT_SKIN;
const themeForId = (id: string): ThemeMode => id === BUILTIN_DARK_SKIN ? "dark" : "light";
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
function storeChoice(id?: string) {
  try {
    if (id) localStorage.setItem(customChoiceKey, id);
    else localStorage.removeItem(customChoiceKey);
  } catch { /* The selected appearance is still available in this tab. */ }
}

/** The host owns activation and revokes every stage of a retired request. */
export function usePublicSkin(options: PublicSkinOptions = {}) {
  const activeSkin = options.activeSkin ?? shallowRef<InstalledSkin | null>(null);
  const activeSkinId = ref<string>(builtInId());
  const skinReady = ref(true);
  const skinLoadError = shallowRef<{ skinId: string } | null>(null);
  const installedSkins = ref<InstalledSkin[]>([]);
  const catalogSkins = ref<SkinCatalogEntry[]>([...BUILTIN_SKIN_CATALOG]);
  let current: ReturnType<typeof createSkinOperation> | undefined;
  let disposed = false;

  const owns = (operation: ReturnType<typeof createSkinOperation>) => !disposed && current === operation;
  function cancel() { current?.cancel(); current = undefined; }
  function begin(timeoutMs = options.timeoutMs) {
    cancel();
    return current = createSkinOperation({ timeoutMs });
  }
  function showBuiltIn(theme = hostTheme.value) {
    clearCustomSkinStyle();
    activeSkin.value = null;
    activeSkinId.value = builtInId(theme);
    applyTheme(theme);
    storeSkinId(activeSkinId.value);
  }

  onScopeDispose(() => { disposed = true; cancel(); clearCustomSkinStyle(); setHostChromeActiveSkin(undefined); });
  watch(activeSkin, (skin) => setSkinHostChromeParts(skin?.chromeData), { immediate: true, flush: "sync" });
  watch(activeSkinId, (id) => setHostChromeActiveSkin(id), { immediate: true, flush: "sync" });
  watch(hostTheme, theme => { if (!activeSkin.value) activeSkinId.value = builtInId(theme); }, { flush: "sync" });

  const eligible = (id: string) => catalogSkins.value.some(skin => skin.id === id)
    || installedSkins.value.some(skin => skin.id === id && skin.source === "local");

  async function applyCustom(id: string, operation: ReturnType<typeof createSkinOperation>) {
    operation.check();
    if (!thirdPartyAllowed.value || !eligible(id)) throw new Error("The selected skin is unavailable.");
    const entry = catalogSkins.value.find(skin => skin.id === id);
    const skin = await operation.wait(activateSkin(id, entry?.version, options.appVersion?.(), { signal: operation.signal, timeoutMs: operation.timeoutMs }));
    if (!owns(operation) || !thirdPartyAllowed.value) return;
    if (!skin) throw new Error("The selected skin could not be activated.");
    activeSkin.value = skin;
    activeSkinId.value = skin.id;
    skinLoadError.value = null;
    storeChoice(skin.id);
  }

  function recover(operation: ReturnType<typeof createSkinOperation>, id: string, error: unknown) {
    if (!owns(operation) || (error as { name?: string })?.name === "AbortError") return;
    skinLoadError.value = { skinId: id };
    storeChoice();
    showBuiltIn();
  }

  async function initialize() {
    if (disposed) return;
    const operation = begin();
    let choice: string | null = null;
    try {
      const legacyChoice = read("webspeak:skin-choice");
      if (legacyChoice && !OFFICIAL_SKIN_IDS.has(legacyChoice)) {
        try { localStorage.removeItem("webspeak:skin-choice"); } catch { /* Optional storage. */ }
      }
      if (read("webspeak:active-skin") === RETIRED_KAAK_ID) storeSkinId(builtInId());
      const [preferences, available, installed] = await operation.wait(Promise.all([
        loadLocalPreferences(), listPublicSkins({ signal: operation.signal }),
        thirdPartyAllowed.value ? listInstalledSkins() : Promise.resolve([]),
      ]));
      installedSkins.value = installed;
      catalogSkins.value = available;
      const preference = getThemePreference();
      const migrated = preferences.theme === "system" ? resolveLegacySystemTheme() : preferences.theme;
      const defaultId = getPublicDefaultSkinId();
      if (!preference && migrated) {
        saveTheme(migrated, { preserveCustomSkins: true });
        void saveLocalPreferences({ schemaVersion: 1, theme: migrated }, operation.signal).catch(() => undefined);
      }
      showBuiltIn(preference ?? migrated ?? themeForId(defaultId));
      choice = thirdPartyAllowed.value ? read(customChoiceKey) : null;
      if (choice) await applyCustom(choice, operation);
    } catch (error) {
      if (choice) recover(operation, choice, error);
    } finally { operation.finish(); }
  }

  async function select(id: string) {
    if (disposed) return;
    const operation = begin(options.timeoutMs ?? 25_000);
    try {
      if (OFFICIAL_SKIN_IDS.has(id)) {
        const theme = themeForId(id);
        skinLoadError.value = null;
        storeChoice();
        showBuiltIn(theme);
        saveTheme(theme);
        void saveLocalPreferences({ schemaVersion: 1, theme, skinId: id }, operation.signal).catch(() => undefined);
      } else {
        if (!thirdPartyAllowed.value) return;
        await applyCustom(id, operation);
      }
    } catch (error) { recover(operation, id, error); }
    finally { operation.finish(); }
  }

  async function importLocal(file: File) {
    if (disposed || !thirdPartyAllowed.value) return;
    const operation = begin();
    try {
      const { importSkinPack } = await operation.wait(import("../services/skin-pack.js"));
      const skin = { ...await operation.wait(importSkinPack(file)), source: "local" as const };
      if (skin.id.startsWith("builtin.")) throw new Error("Built-in IDs are reserved.");
      await operation.wait(saveInstalledSkin(skin, operation.signal));
      if (!owns(operation) || !thirdPartyAllowed.value) return;
      installedSkins.value = [...installedSkins.value.filter(item => item.id !== skin.id), skin];
      return skin.id;
    } finally { operation.finish(); }
  }

  async function reset() {
    if (disposed) return;
    cancel();
    storeChoice();
    skinLoadError.value = null;
    if (thirdPartyAllowed.value) setInstanceAuthorization(false);
    showBuiltIn("light");
    await initialize();
  }
  const switchToBuiltIn = () => select(builtInId());
  const switchToBuiltInAfterLoadError = () => skinLoadError.value ? switchToBuiltIn() : Promise.resolve();

  watch(thirdPartyAllowed, allowed => {
    if (disposed) return;
    if (allowed) { void initialize(); return; }
    cancel();
    storeChoice();
    installedSkins.value = [];
    skinLoadError.value = null;
    showBuiltIn();
  }, { flush: "sync" });
  watch(hostBuiltInSkinRequests, () => { if (!disposed) void switchToBuiltIn(); }, { flush: "sync" });
  return { activeSkin, activeSkinId, skinReady, skinLoadError, importLocal,
    installedSkins: computed(() => thirdPartyAllowed.value ? installedSkins.value.filter(skin => skin.source === "local") : []),
    catalogSkins: computed(() => thirdPartyAllowed.value ? catalogSkins.value : BUILTIN_SKIN_CATALOG),
    initialize, select, cancel, reset, switchToBuiltIn, switchToBuiltInAfterLoadError };
}
