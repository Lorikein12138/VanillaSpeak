<template>
  <RouterLink class="product-brand" to="/" :aria-label="homeLabel || PRODUCT_NAME">
    <img src="/brand/vanillaspeak-64.png" srcset="/brand/vanillaspeak-64.png 64w, /brand/vanillaspeak-128.png 128w"
      :sizes="size + 'px'" :width="size" :height="size" alt="" />
    <span>
      <strong>{{ PRODUCT_NAME }}</strong>
      <small v-if="subtitle">{{ subtitle }}</small>
    </span>
  </RouterLink>
</template>

<script setup lang="ts">
import { PRODUCT_NAME } from "../../../src/shared/product.js";

withDefaults(defineProps<{ size?: number; homeLabel?: string; subtitle?: string }>(), { size: 36 });
</script>
