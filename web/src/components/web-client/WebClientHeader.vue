<template>
  <header class="product-header public-home-header">
    <ProductBrand :size="36" :home-label="appearanceCopy(language).home" />
    <nav class="product-navigation">
      <SkinSwitcher
        ref="skinSwitcher"
        :model-value="skinId"
        :menu-label="appearanceCopy(language).theme"
        :preferences-label="appearanceCopy(language).preferences"
        :options="skinOptions"
        icon-only
        @change="emit('skinChange', $event)"
        @preferences="emit('preferences', $event)"
      />
      <LanguageSwitcher v-model="language" skin-icon icon-only :menu-label="t('languageMenu')" @change="emit('languageChange')" />
    </nav>
  </header>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { appearanceCopy } from "../../i18n/appearance.js";
import ProductBrand from "../ProductBrand.vue";
import SkinSwitcher, { type SkinOption } from "../SkinSwitcher.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import type { Language } from "../../i18n/web-client.js";

defineProps<{
  skinId: string;
  skinOptions: SkinOption[];
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const skinSwitcher = ref<InstanceType<typeof SkinSwitcher> | null>(null);
defineExpose({ focusSkinSwitcher: () => skinSwitcher.value?.focusTrigger() });
const language = defineModel<Language>("language", { required: true });
const emit = defineEmits<{ skinChange: [value: string]; languageChange: []; preferences: [trigger: HTMLElement | null] }>();
</script>

<style scoped>
.public-home-header {
  width: min(1320px, 100%);
  margin-inline: auto;
  padding-inline: max(clamp(14px, 4vw, 48px), env(safe-area-inset-left)) max(clamp(14px, 4vw, 48px), env(safe-area-inset-right));
}
</style>
