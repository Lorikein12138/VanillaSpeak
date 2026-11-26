<template>
  <div ref="root" class="skin-switcher" :class="{ open }" @keydown.esc.stop="dismiss" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)">
    <button
      type="button"
      class="skin-trigger"
      :class="{ 'icon-only': iconOnly }"
      data-ws-part="skin.trigger"
      :disabled="options.length === 0"
      :aria-label="menuLabel"
      :title="`${menuLabel}: ${selectedOption.label}`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :data-ws-state="open ? 'open' : 'closed'"
      :aria-controls="menuId"
      @click.stop="toggle"
    >
      <Icon :name="selectedOption.icon || 'compass'" :size="iconOnly ? 19 : 15" data-ws-icon-slot="skin.trigger" />
      <template v-if="!iconOnly">
        <span>{{ menuLabel }}</span>
        <Icon name="chevron-down" :size="12" />
      </template>
    </button>

    <div v-if="open" class="skin-dropdown" data-ws-part="skin.menu" @click.stop>
      <div :id="menuId" class="skin-options" role="listbox" :aria-label="menuLabel">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="skin-option"
          data-ws-part="skin.option"
          :data-ws-skin-id="option.value"
          :class="{ selected: modelValue === option.value }"
          role="option"
          :aria-selected="modelValue === option.value"
          @click="select(option.value)"
        >
          <Icon :name="option.icon || 'compass'" :size="16" />
          <span>{{ option.label }}</span>
          <Icon v-if="modelValue === option.value" name="check" :size="14" />
        </button>
      </div>
      <button
        v-if="preferencesLabel"
        type="button"
        class="skin-option skin-preferences"
        aria-haspopup="dialog"
        @click="openPreferences"
      ><Icon name="settings" :size="16" /><span>{{ preferencesLabel }}</span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";

export interface SkinOption {
  value: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  modelValue: string;
  menuLabel: string;
  preferencesLabel?: string;
  iconOnly?: boolean;
  options: SkinOption[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
  preferences: [trigger: HTMLElement | null];
}>();

const options = computed(() => props.options.filter(({ value }) => value === "builtin.light" || value === "builtin.dark"));
const selectedOption = computed(() => options.value.find((option) => option.value === props.modelValue) ?? options.value[0] ?? {
  value: props.modelValue,
  label: props.menuLabel,
  icon: "compass",
});
const root = ref<HTMLElement | null>(null);
const open = ref(false);
const menuId = `skin-menu-${Math.random().toString(36).slice(2, 9)}`;

function toggle() { open.value = !open.value; }
function close() { open.value = false; }
function select(value: string) {
  emit("update:modelValue", value);
  emit("change", value);
  dismiss();
}
function dismiss() {
  if (!open.value) return;
  close();
  root.value?.querySelector<HTMLButtonElement>(".skin-trigger")?.focus();
}
function openPreferences() {
  const trigger = root.value?.querySelector<HTMLButtonElement>(".skin-trigger") ?? null;
  close();
  emit("preferences", trigger);
}

async function move(direction: number) {
  if (!open.value) {
    open.value = true;
    await nextTick();
  }
  const items = [...(root.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
  if (!items.length) return;
  const focused = items.indexOf(document.activeElement as HTMLButtonElement);
  const index = focused < 0 ? (direction > 0 ? 0 : items.length - 1) : (focused + direction + items.length) % items.length;
  items[index]?.focus();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

onMounted(() => document.addEventListener("pointerdown", onDocumentPointerDown));
onUnmounted(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>

<style scoped>
.skin-switcher { position: relative; flex: none; color: var(--ink); }
.skin-switcher.open { z-index: 52; }
.skin-trigger, .skin-option {
  display: inline-flex; gap: 6px; align-items: center; justify-content: center;
  min-height: 38px; padding: 6px 9px; border: 1px solid var(--control-border);
  border-radius: 8px; background: var(--surface); color: var(--ink);
  font: 600 14px/1.25 var(--body-font);
  white-space: nowrap;
}
.skin-trigger:hover, .skin-option:hover, .skin-option[aria-selected="true"] {
  background: var(--selected); color: var(--action);
}
.skin-trigger.icon-only {
  box-sizing: border-box;
  inline-size: 44px;
  block-size: 44px;
  padding: 0;
  border: 0;
  color: var(--muted);
  background: transparent;
}
.skin-trigger.icon-only:hover, .skin-trigger.icon-only[aria-expanded="true"] {
  color: var(--action);
  background: var(--selected);
}
.skin-dropdown {
  position: absolute; top: calc(100% + 7px); right: 0; display: grid; gap: 4px;
  min-width: 156px; max-width: calc(100vw - 32px); padding: 6px;
  color: var(--ink); background: var(--raised); border: 1px solid var(--rule);
  border-radius: 8px; box-shadow: var(--popover-shadow);
}
.skin-option {
  display: flex; justify-content: flex-start; width: 100%; color: var(--ink);
  border-color: transparent; background: transparent; text-align: start;
}
.skin-options { display: grid; gap: 4px; }
.skin-preferences { border-top-color: var(--rule); }
.skin-option span { flex: 1; }
@media (max-width: 899px) {
  .skin-trigger, .skin-option { min-height: 44px; }
}
</style>
