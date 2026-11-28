import { PRODUCT_NAME } from "../../../src/shared/product.js";
import { DEFAULT_WELCOME_TEXTS } from "../../../src/site-copy.js";
import { computed, onScopeDispose, reactive, ref, type Ref } from "vue";
import { DEFAULT_TEAM_SPEAK_PORT, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import { APP_VERSION } from "../services/app-version.js";
import { setInstanceHiddenParts } from "../services/host-chrome.js";
import type { Language } from "../i18n/web-client.js";

interface RelayOption {
  id: string;
  name: string;
}

type Translator = (key: string, variables?: Record<string, string | number>) => string;

interface UseWebClientPublicConfigOptions {
  serverHost: Ref<string>;
  serverPort: Ref<string>;
  accelerationRelayId: Ref<string>;
  language: Ref<Language>;
  t: Translator;
}

export function useWebClientPublicConfig({
  serverHost,
  serverPort,
  accelerationRelayId,
  language,
  t,
}: UseWebClientPublicConfigOptions) {
  const accessMode = ref<"fixed" | "open">("fixed");
  const initialized = ref(false);
  const mobileMode = ref(false);
  const siteName = ref(PRODUCT_NAME);
  const appVersion = ref(APP_VERSION);
  const visitorNumber = ref<number | null>(null);
  const visitorTotal = ref<number | null>(null);
  const accelerationRelays = ref<RelayOption[]>([]);
  const openTargetPrefillBlocked = ref(false);
  const serverConfigLoading = ref(true);
  const serverConfigUnavailable = ref(false);
  const initialTarget = { address: serverHost.value, port: serverPort.value };
  let defaultTarget = initialTarget;
  let pending: AbortController | undefined;
  onScopeDispose(() => pending?.abort());
  const welcomeTexts = reactive<Record<Language, string>>({ zh: "", en: "", de: "", ru: "", ja: "" });
  const accelerationAvailable = computed(() => accelerationRelays.value.length > 0);
  const localizedWelcomeText = computed(() => welcomeTexts[language.value] || t("joinDescription"));
  // The public API returns pre-resolved defaults as well as administrator copy.
  const customWelcomeText = computed(() => {
    const configured = welcomeTexts[language.value];
    return configured === DEFAULT_WELCOME_TEXTS[language.value] ? "" : configured;
  });

  function restoreServerTarget() {
    serverHost.value = defaultTarget.address;
    serverPort.value = defaultTarget.port;
  }

  async function loadPublicConfig(): Promise<void> {
    pending?.abort();
    const operation = new AbortController();
    pending = operation;
    serverConfigLoading.value = true;
    serverConfigUnavailable.value = false;
    const signal = AbortSignal.any([operation.signal, AbortSignal.timeout(10_000)]);
    const query = new URLSearchParams(location.search);
    try {
      const response = await fetch("/api/public-config", { headers: { accept: "application/json" }, signal });
      if (!response.ok) throw new Error("Public configuration unavailable");
      const config = await response.json() as {
        version?: unknown;
        initialized?: unknown;
        mobile?: unknown;
        siteName?: unknown;
        welcomeText?: unknown;
        welcomeTextEn?: unknown;
        welcomeTexts?: unknown;
        accessMode?: unknown;
        target?: unknown;
        targetPrefillBlocked?: unknown;
        visitorNumber?: unknown;
        visitorTotal?: unknown;
        accelerationRelays?: unknown;
        hiddenHostParts?: unknown;
      };
      signal.throwIfAborted();
      if (pending !== operation) return;
      if (!config || typeof config.initialized !== "boolean") throw new Error("Invalid public configuration");
      setInstanceHiddenParts(Array.isArray(config.hiddenHostParts)
        ? config.hiddenHostParts.filter((part): part is string => typeof part === "string")
        : []);
      if (typeof config.version === "string" && config.version.trim()) appVersion.value = config.version.trim();
      visitorNumber.value = Number.isSafeInteger(config.visitorNumber) && Number(config.visitorNumber) > 0 ? Number(config.visitorNumber) : null;
      visitorTotal.value = Number.isSafeInteger(config.visitorTotal) && Number(config.visitorTotal) > 0 ? Number(config.visitorTotal) : null;
      initialized.value = config.initialized === true;
      mobileMode.value = config.mobile === true;
      if (typeof config.siteName === "string" && config.siteName.trim()) siteName.value = config.siteName.trim();
      if (typeof config.welcomeText === "string") welcomeTexts.zh = config.welcomeText;
      if (typeof config.welcomeTextEn === "string") welcomeTexts.en = config.welcomeTextEn;
      if (config.welcomeTexts && typeof config.welcomeTexts === "object" && !Array.isArray(config.welcomeTexts)) {
        const configuredTexts = config.welcomeTexts as Record<string, unknown>;
        for (const languageCode of ["zh", "en", "de", "ru", "ja"] as const) {
          const text = configuredTexts[languageCode];
          if (typeof text === "string") welcomeTexts[languageCode] = text;
        }
      }
      accessMode.value = config.accessMode === "open" ? "open" : "fixed";
      accelerationRelays.value = Array.isArray(config.accelerationRelays)
        ? config.accelerationRelays.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const relay = value as { id?: unknown; name?: unknown };
          return typeof relay.id === "string" && typeof relay.name === "string" && relay.id && relay.name
            ? [{ id: relay.id, name: relay.name }]
            : [];
        })
        : [];
      if (!accelerationAvailable.value || !accelerationRelays.value.some((relay) => relay.id === accelerationRelayId.value)) accelerationRelayId.value = "";
      const hasInviteTarget = query.has("server") || query.has("target") || query.has("tsHost") || query.has("tsPort");
      openTargetPrefillBlocked.value = !hasInviteTarget && accessMode.value === "open" && config.targetPrefillBlocked === true;
      const configuredTarget = !hasInviteTarget && typeof config.target === "string" && config.target.trim()
        ? splitTeamSpeakTarget(config.target)
        : undefined;
      defaultTarget = openTargetPrefillBlocked.value
        ? { address: "", port: DEFAULT_TEAM_SPEAK_PORT }
        : configuredTarget ?? initialTarget;
      if (openTargetPrefillBlocked.value || configuredTarget) restoreServerTarget();
    } catch {
      if (pending === operation && !operation.signal.aborted) {
        initialized.value = false;
        serverConfigUnavailable.value = true;
      }
    } finally {
      if (pending === operation && !operation.signal.aborted) serverConfigLoading.value = false;
    }
  }

  return {
    accessMode,
    initialized,
    mobileMode,
    siteName,
    appVersion,
    visitorNumber,
    visitorTotal,
    accelerationRelays,
    openTargetPrefillBlocked,
    accelerationAvailable,
    serverConfigLoading,
    serverConfigUnavailable,
    localizedWelcomeText,
    customWelcomeText,
    loadPublicConfig,
    restoreServerTarget,
  };
}
