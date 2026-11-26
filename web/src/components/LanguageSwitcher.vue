<template>
  <div ref="root" class="language-switcher" :class="{ open }" @keydown.esc.stop="dismiss" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)">
    <button
      type="button"
      class="language-trigger"
      :class="{ 'icon-only': iconOnly }"
      data-ws-part="language.trigger"
      :aria-label="menuLabel"
      :title="menuLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :data-ws-state="open ? 'open' : 'closed'"
      :aria-controls="menuId"
      @click.stop="toggle"
    >
      <Icon class="language-current-icon" :name="iconOnly ? 'globe' : 'translate'" :size="iconOnly ? 20 : 24" :data-ws-icon-slot="skinIcon ? 'language.trigger' : undefined" />
      <template v-if="!iconOnly">
        <span class="language-current-flag" aria-hidden="true">{{ currentLanguage.flag }}</span>
        <span class="language-current-code">{{ currentLanguage.code }}</span>
        <Icon name="chevron-down" :size="13" />
      </template>
    </button>

    <div v-if="open" :id="menuId" class="language-dropdown" data-ws-part="language.menu" role="listbox" :aria-label="menuLabel" @click.stop>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="language-option"
        data-ws-part="language.option"
        :data-ws-language="option.value"
        :class="{ selected: modelValue === option.value }"
        role="option"
        :aria-selected="modelValue === option.value"
        @pointerdown.stop.prevent="select(option.value)"
        @keydown.enter.prevent="select(option.value)"
        @keydown.space.prevent="select(option.value)"
      >
        <span class="language-option-flag" aria-hidden="true">{{ option.flag }}</span>
        <span class="language-option-copy">
          <strong>{{ option.label }}</strong>
          <small>{{ option.code }}</small>
        </span>
        <Icon v-if="modelValue === option.value" name="check" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";

type Language = "zh" | "en" | "de" | "ru" | "ja";

const props = withDefaults(defineProps<{
  skinIcon?: boolean;
  iconOnly?: boolean;
  modelValue: Language;
  menuLabel?: string;
}>(), {
  menuLabel: "Language",
});

const emit = defineEmits<{
  "update:modelValue": [value: Language];
  change: [value: Language];
}>();

const options: Array<{ value: Language; code: string; label: string; flag: string }> = [
  { value: "zh", code: "ZH", label: "中文", flag: "🇨🇳" },
  { value: "en", code: "EN", label: "English", flag: "🇬🇧" },
  { value: "de", code: "DE", label: "Deutsch", flag: "🇩🇪" },
  { value: "ru", code: "RU", label: "Русский", flag: "🇷🇺" },
  { value: "ja", code: "JA", label: "日本語", flag: "🇯🇵" },
];

const root = ref<HTMLElement | null>(null);
const open = ref(false);
const menuId = `language-menu-${Math.random().toString(36).slice(2, 9)}`;
const currentLanguage = computed(() => options.find((option) => option.value === props.modelValue) ?? options[0]);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function select(value: Language) {
  emit("update:modelValue", value);
  emit("change", value);
  dismiss();
}

function dismiss() {
  if (!open.value) return;
  close();
  root.value?.querySelector<HTMLButtonElement>(".language-trigger")?.focus();
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
.language-switcher { position: relative; flex: none; color: var(--ink); }
.language-switcher.open { z-index: 52; }
.language-trigger, .language-option {
  display: inline-flex; gap: 6px; align-items: center; justify-content: center;
  min-height: 38px; padding: 6px 9px; border: 1px solid var(--control-border);
  border-radius: 8px; background: var(--surface); color: var(--ink);
  font: 600 14px/1.25 var(--body-font);
  white-space: nowrap;
}
.language-trigger:hover, .language-option:hover, .language-option[aria-selected="true"] {
  background: var(--selected); color: var(--action);
}
.language-trigger.icon-only {
  box-sizing: border-box;
  inline-size: 44px;
  block-size: 44px;
  padding: 0;
  border: 0;
  color: var(--muted);
  background: transparent;
}
.language-trigger.icon-only > .language-current-icon { display: block; width: 20px; height: 20px; }
.language-trigger.icon-only:hover, .language-trigger.icon-only[aria-expanded="true"] {
  color: var(--action);
  background: var(--selected);
}
.language-dropdown {
  position: absolute; top: calc(100% + 7px); right: 0; display: grid; gap: 4px;
  min-width: 156px; max-width: calc(100vw - 32px); padding: 6px;
  color: var(--ink); background: var(--raised); border: 1px solid var(--rule);
  border-radius: 8px; box-shadow: var(--popover-shadow);
}
.language-option {
  display: flex; justify-content: flex-start; width: 100%; color: var(--ink);
  border-color: transparent; background: transparent; text-align: start;
}
.language-option span { flex: 1; }
@media (max-width: 899px) {
  .language-trigger, .language-option { min-height: 44px; }
}
</style>
