<template>
  <!-- Host chrome is intentionally outside .ws-skin-root so a v3 surface
       replacement cannot delete the recovery path. -->
  <Teleport to="body">
    <div class="ws-host-chrome" data-ws-host-chrome>
      <div
        v-if="!isHostPartHidden('host.watermark')"
        class="ws-host-watermark"
        data-ws-part="host.watermark"
        aria-hidden="true"
      >VanillaSpeak</div>

      <p
        v-if="!isHostPartHidden('host.hint')"
        class="ws-host-hint"
        data-ws-part="host.hint"
      >{{ copy.hint }}</p>

      <div
        v-if="!isHostPartHidden('host.voice-status-decoration')"
        class="ws-host-voice-status-decoration"
        data-ws-part="host.voice-status-decoration"
        aria-hidden="true"
      ><span></span><span></span></div>
    </div>
  </Teleport>

  <!-- Trusted recovery entry. It lives in a closed shadow root and a manual
       popover, so no compiled skin selector can target it (shadow boundary)
       and no normal stacking context can cover it (top layer). It carries no
       `data-ws-part`: there is intentionally no skin hook for this control. -->
  <Teleport v-if="layer" :to="layer.container">
    <div
      ref="recoveryPopover"
      popover="manual"
      @keydown.escape="onRecoveryEscape"
      @click.self="compactPinned = compact || compactPinned"
      @focusout="onRecoveryFocusOut"
      class="ws-host-recovery"
      :class="{ 'ws-host-recovery-compact': compact }"
      :data-ws-float="slotMode === 'slotted' ? undefined : floatPosition"
      :tabindex="compact || compactPinned ? 0 : -1"
      data-ws-host-recovery
      role="region"
      :aria-label="copy.recovery"
    >
      <span class="ws-host-recovery-mark" aria-hidden="true">◈</span>
      <button
        type="button"
        class="ws-host-recovery-action"
        data-ws-recovery-action="built-in"
        :title="copy.shortcut"
        @click="useBuiltInSkin"
      >{{ copy.useBuiltIn }}</button>
      <button
        type="button"
        class="ws-host-recovery-action"
        v-if="pluginLibraryAvailable"
        data-ws-recovery-action="library"
        :title="copy.library"
        @click="openLibrary"
      >{{ copy.library }}</button>
      <button v-if="preferencesAvailable" ref="preferencesTrigger" type="button" class="ws-host-recovery-action" data-ws-recovery-action="preferences" aria-haspopup="dialog" @click="emit('preferences', restorePreferencesFocus)">
        {{ appearanceCopy(language).preferences }}
      </button>
      <button v-if="thirdPartyAllowed" type="button" class="ws-host-recovery-action" data-ws-recovery-action="disable" @click="setInstanceAuthorization(false)">{{ appearanceCopy(language).disable }}</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SiteLanguage } from "../../../src/site-copy.js";
import { hostChromeCopy } from "../i18n/host-chrome.js";
import {
  activeHostSlot,
  hostChromeActiveSkinId,
  isHostPartHidden,
  isHostPartVisuallyReachable,
  isRecoveryShortcut,
  isThirdPartySkinActive,
  openPluginLibrary,
  requestBuiltInSkin,
} from "../services/host-chrome.js";
import {
  createHostOwnedLayer,
  syncRecoveryPopover,
  type HostOwnedLayer,
} from "../services/host-owned-layer.js";
import { bindHostSlot, type HostSlotBinding } from "../services/host-slot-placement.js";
import {
  bindFloatingAvoidance,
  type FloatingAvoidance,
  type FloatingPosition,
} from "../services/host-floating-placement.js";
import { shouldShowRecovery } from "../services/host-chrome-visibility.js";
import { appearanceCopy } from "../i18n/appearance.js";
import { setInstanceAuthorization, thirdPartyAllowed } from "../services/instance-authorization.js";
import {
  RECOVERY_CONTROL_DEFAULTS,
  bindHostControlTheme,
  findSkinRoot,
} from "../services/host-control-tokens.js";

const props = withDefaults(defineProps<{ language: SiteLanguage; connected?: boolean; pluginLibraryAvailable?: boolean; preferencesAvailable?: boolean }>(), { connected: false });
const emit = defineEmits<{ preferences: [restoreFocus: () => boolean] }>();
const copy = computed(() => hostChromeCopy[props.language] ?? hostChromeCopy.en);

// Styles live inside the closed shadow root: the component's scoped stylesheet
// in <head> cannot cross the shadow boundary.
const RECOVERY_LAYER_CSS = `
:host { font: 11px/1.2 ui-sans-serif, system-ui, sans-serif; }
.ws-host-recovery {
  --recovery-hit-target: var(--ws-control-hit, 38px);
  position: fixed;
  inset: auto auto calc(38px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  margin: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: calc(100vw - 24px);
  padding: 4px 5px 4px 9px;
  border: 1px solid var(--ws-control-border, var(--control-border, #9db6b2));
  border-radius: var(--ws-control-radius, 999px);
  background: var(--ws-control-background, var(--raised, #fff));
  color: var(--ws-control-foreground, var(--ink, #31524f));
  font-family: var(--ws-control-font, ui-sans-serif, system-ui, sans-serif);
  font-size: var(--ws-control-font-size, 11px);
  box-shadow: var(--popover-shadow, 0 6px 18px #0f2a2626);
  pointer-events: auto;
}
.ws-host-recovery:popover-open { display: flex; }
/* Runtime collision avoidance (host-floating-placement.ts): when the default
   corner would cover a skin control, the floating capsule moves. A docked
   (slotted) capsule carries no data-ws-float and uses inline placement. */
.ws-host-recovery[data-ws-float$="right"] { left: auto; right: max(12px, env(safe-area-inset-right)); }
.ws-host-recovery[data-ws-float^="top"] { bottom: auto; top: max(12px, env(safe-area-inset-top)); }
.ws-host-recovery[data-ws-float^="middle"] { bottom: auto; top: 50%; translate: 0 -50%; }
.ws-host-recovery[data-ws-float$="center"] { left: 50%; translate: -50% 0; }
@media (pointer: coarse) {
  .ws-host-recovery { --recovery-hit-target: max(44px, var(--ws-control-hit, 44px)); }
}
.ws-host-recovery-mark {
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
}
.ws-host-recovery button {
  display: inline-flex;
  align-items: center;
  min-height: var(--recovery-hit-target);
  padding: 4px 9px;
  border: 1px solid var(--ws-control-border, var(--control-border, #9db6b2));
  border-radius: var(--ws-control-radius, 999px);
  background: var(--ws-control-background, var(--raised, #fff));
  color: var(--ws-control-foreground, var(--ink, #31524f));
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.ws-host-recovery button[data-ws-recovery-action="built-in"] {
  border-color: var(--ws-control-accent, var(--caution, #b45309));
  background: var(--ws-control-background, var(--surface, #fff7ed));
  color: var(--ws-control-foreground, var(--caution, #7c2d12));
}
.ws-host-recovery button:hover { filter: brightness(.96); }
.ws-host-recovery button:focus-visible { outline: 2px solid var(--ws-control-accent, var(--focus, #4c8f88)); outline-offset: 2px; }
.ws-host-recovery.ws-host-recovery-compact:not(:hover):not(:focus-within) { gap: 0; padding: 4px; }
.ws-host-recovery.ws-host-recovery-compact:not(:hover):not(:focus-within) .ws-host-recovery-action { display: none; }
.ws-host-recovery.ws-host-recovery-compact:not(:hover):not(:focus-within) .ws-host-recovery-mark {
  min-width: var(--recovery-hit-target);
  min-height: var(--recovery-hit-target);
}
.ws-host-recovery.ws-host-recovery-compact:focus-visible { outline: 2px solid var(--ws-control-accent, var(--focus, #4c8f88)); outline-offset: 2px; }
@media (forced-colors: active) {
  .ws-host-recovery button:focus-visible, .ws-host-recovery.ws-host-recovery-compact:focus-visible { outline-color: Highlight; }
}
@media (prefers-reduced-motion: reduce) {
  .ws-host-recovery, .ws-host-recovery button { transition: none !important; }
}
`;

const layer: HostOwnedLayer | null = createHostOwnedLayer("recovery", RECOVERY_LAYER_CSS);

// CSS-only hiding is invisible to `isHostPartHidden`, so sample the launcher's
// live geometry. A one-second interval is enough for a recovery fallback and
// stays cheaper than a MutationObserver on the whole document. While a
// third-party skin is active the entry is persistent and this sample only
// matters for the official-skin fallback.
const launcherReachable = ref(true);
const showRecovery = computed(() => shouldShowRecovery({
  connected: props.connected && Boolean(props.pluginLibraryAvailable),
  thirdPartyAllowed: thirdPartyAllowed.value,
  thirdPartySkinActive: isThirdPartySkinActive(),
  launcherHiddenByConfig: isHostPartHidden("host.plugins.launcher"),
  launcherReachable: launcherReachable.value,
}));

// The documented shortcut can summon the same host-owned entry even while a
// bundled skin is active (for example after a broken third-party skin was
// already reset). It never renders decoration on its own.
const shortcutOpen = ref(false);
const recoveryPopover = ref<HTMLElement | null>(null);
const preferencesTrigger = ref<HTMLButtonElement | null>(null);

let slotBinding: HostSlotBinding | undefined;

/**
 * Theme the capsule even when the skin does not declare a slot. While a slot
 * binding exists it reads the anchor first and owns the tokens; this
 * root-level pass covers the slot-less capsule and refreshes itself when the
 * skin stylesheet arrives after the stored skin id.
 */
const recoveryTheme = layer ? bindHostControlTheme({
  layer,
  control: () => recoveryPopover.value,
  part: "host.recovery",
  defaults: RECOVERY_CONTROL_DEFAULTS,
  source: () => thirdPartyAllowed.value && isThirdPartySkinActive()
    ? findSkinRoot(hostChromeActiveSkinId.value) : null,
  // While a slot binding exists it owns the capsule tokens (anchor first).
  active: () => !slotBinding,
}) : null;

const recoveryVisible = computed(() => showRecovery.value || (shortcutOpen.value && thirdPartyAllowed.value));

/**
 * Optional anchor from the active skin's chrome.json. Only third-party skins
 * can declare it; the host still owns the capsule and the module falls back to
 * the default corner whenever the anchor stops being usable.
 */
const slotConfig = computed(() => thirdPartyAllowed.value ? activeHostSlot("host.recovery") : undefined);
const slotMode = ref<"floating" | "slotted">("floating");
const compactHold = ref(true);
let compactHoldTimer: ReturnType<typeof setTimeout> | undefined;

// Keep the full capsule visible for a moment after it first docks into a
// newly activated skin, so the entry stays discoverable before it folds into
// the skin's layout. The skin id is known from localStorage before the skin
// (and its anchor) has loaded, so the 5 s window starts on the first
// floating -> slotted transition for that skin, not on the id change.
let compactHoldStarted = false;
watch(hostChromeActiveSkinId, () => {
  compactHold.value = true;
  compactHoldStarted = false;
  if (compactHoldTimer) clearTimeout(compactHoldTimer);
  compactHoldTimer = undefined;
}, { immediate: true });
watch(slotMode, (mode) => {
  if (mode !== "slotted" || compactHoldStarted) return;
  compactHoldStarted = true;
  compactHoldTimer = setTimeout(() => { compactHold.value = false; }, 5000);
});

/** Set by the shortcut; cleared once focus leaves the capsule. */
const shortcutExpanded = ref(false);
/** A tap/click on the compact mark keeps it expanded (no hover on touch). */
const compactPinned = ref(false);

/**
 * Floating (not docked) capsule: corner chosen at runtime so it does not cover
 * skin controls, and folded to its mark when every corner collides.
 */
const floatPosition = ref<FloatingPosition>("bottom-left");
const floatCompact = ref(false);
let floatingAvoidance: FloatingAvoidance | undefined;
let floatingElement: HTMLElement | null = null;
/** Sticky `:hover` after a tap on touch screens must not pause avoidance. */
const canHover = () => typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;

const compact = computed(() => !shortcutExpanded.value
  && !compactPinned.value
  && (slotMode.value === "slotted"
    ? Boolean(slotConfig.value?.compact) && !compactHold.value
    : floatCompact.value));

function onRecoveryEscape() {
  shortcutOpen.value = false;
  shortcutExpanded.value = false;
  compactPinned.value = false;
}

/** Unpin when the pointer goes down anywhere outside the host layer. */
function onDocumentPointerDown(event: PointerEvent) {
  if (!compactPinned.value || !layer) return;
  // Events from inside the closed shadow root are retargeted to its host.
  if (event.composedPath().includes(layer.host)) return;
  compactPinned.value = false;
}

function onRecoveryFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (next instanceof Node && recoveryPopover.value?.contains(next)) return;
  shortcutExpanded.value = false;
  compactPinned.value = false;
}

function syncSlotBinding() {
  slotBinding?.dispose();
  slotBinding = undefined;
  // Disposing a slot clears its inline tokens; restore the root-level theme
  // before deciding whether a new anchor should override it.
  recoveryTheme?.apply();
  // A fresh binding starts floating and reports its first successful dock.
  slotMode.value = "floating";
  const control = recoveryPopover.value;
  const config = slotConfig.value;
  if (!control || !config || !layer) return;
  slotBinding = bindHostSlot({
    layer,
    control,
    anchor: config.anchor,
    skinId: hostChromeActiveSkinId.value,
    align: config.align,
    onModeChange: change => { slotMode.value = change.mode; },
  });
}

function bindFloating() {
  const control = recoveryPopover.value;
  // Idempotent: called on mount and whenever the popover element appears.
  if (floatingAvoidance && floatingElement === control) return;
  floatingAvoidance?.dispose();
  floatingAvoidance = undefined;
  floatingElement = null;
  if (!control || !layer) return;
  const host = layer.host;
  floatingElement = control;
  floatingAvoidance = bindFloatingAvoidance({
    element: control,
    isSelf: node => node === host || host.contains(node),
    // Same numbers as RECOVERY_LAYER_CSS, including env(safe-area-inset-*).
    margins: insets => ({
      top: Math.max(12, insets.top),
      right: Math.max(12, insets.right),
      bottom: 38 + insets.bottom,
      left: Math.max(12, insets.left),
    }),
    insetsParent: layer.shadow,
    defaultPosition: "bottom-left",
    apply: next => { floatPosition.value = next; },
    compactSize: () => {
      const hit = Number.parseFloat(getComputedStyle(control).getPropertyValue("--ws-control-hit")) || 38;
      const target = matchMedia("(pointer: coarse)").matches ? Math.max(44, hit) : hit;
      return { width: target + 10, height: target + 10 };
    },
    onCompactChange: next => { floatCompact.value = next; },
    // Never move the capsule under the user's pointer or focus, and leave a
    // docked capsule to the slot binding.
    paused: () => slotMode.value === "slotted"
      || shortcutExpanded.value
      || compactPinned.value
      || (canHover() && control.matches(":hover"))
      || Boolean(layer.shadow.activeElement),
  });
}

function syncPopover() {
  syncRecoveryPopover(recoveryPopover.value, recoveryVisible.value);
}

function restorePreferencesFocus(): boolean {
  const control = recoveryPopover.value;
  if (!recoveryVisible.value || !layer || !control) return false;
  syncPopover();
  const button = preferencesTrigger.value;
  button?.focus({ preventScroll: true });
  if (button && layer.shadow.activeElement === button) return true;

  // An unfocused compact capsule hides its action buttons. Focusing the
  // capsule exposes them again through :focus-within.
  control.focus({ preventScroll: true });
  button?.focus({ preventScroll: true });
  return control.contains(layer.shadow.activeElement);
}

function useBuiltInSkin() {
  onRecoveryEscape();
  requestBuiltInSkin();
}

function openLibrary() {
  onRecoveryEscape();
  openPluginLibrary();
}

function onKeydown(event: KeyboardEvent) {
  if (event.repeat || !thirdPartyAllowed.value) return;
  if (event.key === "Escape" && shortcutOpen.value && !document.querySelector("dialog[open]")) {
    onRecoveryEscape();
    return;
  }
  // The recovery chord must survive a capture-phase preventDefault() from a
  // skin or plugin, so it is handled before anything else.
  if (isRecoveryShortcut(event)) {
    event.preventDefault();
    shortcutOpen.value = true;
    shortcutExpanded.value = true;
    void nextTick(() => {
      if (!shortcutOpen.value || !thirdPartyAllowed.value) return;
      syncPopover();
      slotBinding?.revalidate();
      recoveryPopover.value?.querySelector<HTMLButtonElement>('[data-ws-recovery-action="built-in"]')?.focus();
    });
  }
}

let reachabilityTimer: ReturnType<typeof setInterval> | undefined;
function refreshLauncherReachability() {
  launcherReachable.value = isHostPartVisuallyReachable("host.plugins.launcher");
}

watch([recoveryVisible, recoveryPopover], () => {
  void nextTick(() => {
    syncPopover();
    slotBinding?.revalidate();
    bindFloating();
    floatingAvoidance?.revalidate();
  });
}, { flush: "post" });
watch([recoveryPopover, hostChromeActiveSkinId, thirdPartyAllowed], () => {
  void nextTick(() => recoveryTheme?.apply());
}, { flush: "post", immediate: true });
watch([slotConfig, hostChromeActiveSkinId], () => {
  void nextTick(() => {
    syncPopover();
    syncSlotBinding();
  });
}, { flush: "post" });
// Home <-> voice page and skin switches replace the controls the floating
// capsule was avoiding; re-place it promptly (and back to its default corner
// when that is free) instead of leaving it where the previous screen needed it.
watch([() => props.connected, hostChromeActiveSkinId], () => {
  void nextTick(() => floatingAvoidance?.screenChanged());
}, { flush: "post" });
watch(thirdPartyAllowed, allowed => { if (!allowed) onRecoveryEscape(); });

onMounted(() => {
  refreshLauncherReachability();
  reachabilityTimer = setInterval(refreshLauncherReachability, 1000);
  window.addEventListener("resize", refreshLauncherReachability);
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("pointerdown", onDocumentPointerDown, true);
  void nextTick(() => {
    syncPopover();
    syncSlotBinding();
    bindFloating();
  });
});
onBeforeUnmount(() => {
  if (reachabilityTimer) clearInterval(reachabilityTimer);
  if (compactHoldTimer) clearTimeout(compactHoldTimer);
  slotBinding?.dispose();
  floatingAvoidance?.dispose();
  floatingAvoidance = undefined;
  floatingElement = null;
  recoveryTheme?.dispose();
  window.removeEventListener("resize", refreshLauncherReachability);
  window.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("pointerdown", onDocumentPointerDown, true);
  layer?.dispose();
});
</script>

<style scoped>
.ws-host-chrome {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.ws-host-watermark {
  position: absolute;
  top: clamp(8px, 6vh, 64px);
  right: clamp(12px, 3vw, 64px);
  color: var(--action);
  font: 800 clamp(40px, 7vw, 104px)/1 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -.06em;
  opacity: .14;
  user-select: none;
  white-space: nowrap;
}
.ws-host-hint {
  position: absolute;
  bottom: calc(10px + env(safe-area-inset-bottom));
  left: 14px;
  max-width: min(46vw, 420px);
  margin: 0;
  color: var(--muted);
  font: 11px/1.4 ui-sans-serif, system-ui, sans-serif;
  opacity: 1;
  user-select: none;
}
.ws-host-voice-status-decoration {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(28vw, 320px);
  height: 28px;
  padding: 0 12px;
  opacity: .28;
}
.ws-host-voice-status-decoration span {
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--control-border);
}
.ws-host-voice-status-decoration span:first-child { width: 64px; }
.ws-host-voice-status-decoration span:last-child { flex: 1; opacity: .6; }
@media (max-width: 640px) {
  .ws-host-hint { max-width: 62vw; }
  .ws-host-voice-status-decoration { display: none; }
}
</style>
