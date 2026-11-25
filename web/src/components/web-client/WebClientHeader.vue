<template>
  <header class="product-header" :data-workspace="connected && !protectedTools">
    <ProductBrand :size="connected ? 30 : 36" :home-label="appearanceCopy(language).home" />
    <nav class="product-navigation">
      <a v-if="!mobile" class="product-control product-admin" href="/admin">
        <Icon name="settings" :size="16" />{{ t("adminConsole") }}
      </a>
      <SkinSwitcher :model-value="skinId" :menu-label="appearanceCopy(language).theme" :options="skinOptions" @change="emit('skinChange', $event)" />
      <LanguageSwitcher v-model="language" skin-icon :menu-label="t('languageMenu')" @change="emit('languageChange')" />
      <slot />
    </nav>
  </header>
</template>

<script setup lang="ts">
import { appearanceCopy } from "../../i18n/appearance.js";
import Icon from "../Icon.vue";
import ProductBrand from "../ProductBrand.vue";
import SkinSwitcher, { type SkinOption } from "../SkinSwitcher.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import type { Language } from "../../i18n/web-client.js";

defineProps<{
  mobile: boolean;
  connected: boolean;
  protectedTools: boolean;
  skinId: string;
  skinOptions: SkinOption[];
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const language = defineModel<Language>("language", { required: true });
const emit = defineEmits<{ skinChange: [value: string]; languageChange: [] }>();
</script>
