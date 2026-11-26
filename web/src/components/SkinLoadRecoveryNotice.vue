<template>
  <Teleport to="body">
    <section v-if="error" class="skin-load-recovery" data-ws-part="app.skin-load-recovery" role="alert">
      <p>{{ labels.skinLoadError(error.skinId) }}</p>
      <button type="button" @click="$emit('use-built-in')">{{ labels.skinUseBuiltIn }}</button>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Language } from "../i18n/web-client.js";
import { resolveSkinLayoutLanguage, skinLayoutLabels } from "../i18n/skin-layout.js";

defineEmits<{ "use-built-in": [] }>();

const props = defineProps<{
  error: { skinId: string } | null;
  language: Language;
}>();
const labels = computed(() => skinLayoutLabels[resolveSkinLayoutLanguage(props.language)]);
</script>

<style scoped>
.skin-load-recovery {
  position: fixed;
  z-index: 2147482500;
  top: max(12px, env(safe-area-inset-top));
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: min(720px, calc(100vw - 24px));
  padding: 10px 12px;
  transform: translateX(-50%);
  border: 1px solid var(--caution);
  border-radius: 12px;
  color: var(--caution);
  background: var(--caution-surface);
  box-shadow: var(--popover-shadow);
  font: 14px/1.45 ui-sans-serif, system-ui, sans-serif;
}
.skin-load-recovery p { flex: 1; min-width: 0; margin: 0; overflow-wrap: anywhere; }
.skin-load-recovery button { flex: 0 0 auto; min-height: 44px; max-width: 100%; padding: 7px 10px; border: 1px solid var(--caution); border-radius: 8px; color: var(--caution); background: var(--surface); cursor: pointer; white-space: normal; }
.skin-load-recovery button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

@media (max-width: 520px) {
  .skin-load-recovery { align-items: stretch; flex-direction: column; gap: 7px; }
  .skin-load-recovery button { width: 100%; }
}
</style>
