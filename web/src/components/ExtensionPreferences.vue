<template>
  <details class="product-more" ref="menu">
    <summary class="product-control">{{ copy.more }}</summary>
    <div class="product-more-panel">
      <a v-if="!native" class="product-control product-admin-mobile" href="/admin">{{ adminLabel }}</a>
      <button ref="trigger" type="button" class="product-control" aria-haspopup="dialog" @click="open">{{ copy.preferences }}</button>
    </div>
  </details>
  <Teleport to="body">
    <dialog ref="dialog" class="appearance-dialog" :aria-labelledby="titleId" @close="restoreFocus">
      <div class="appearance-dialog-header">
        <h2 :id="titleId">{{ copy.preferences }}</h2>
        <button type="button" class="product-control" autofocus @click="dialog?.close()">{{ copy.close }}</button>
      </div>
      <section class="appearance-section">
        <h3>{{ copy.extensions }}</h3>
        <p class="appearance-scope">{{ copy.scope }}</p>
        <p>{{ copy.explanation }}</p>
        <p role="status">{{ thirdPartyAllowed ? copy.enabled : copy.disabled }}</p>
        <button type="button" class="product-control" :class="{ 'product-primary': !thirdPartyAllowed }"
          @click="setInstanceAuthorization(!thirdPartyAllowed)">{{ thirdPartyAllowed ? copy.disable : copy.enable }}</button>
      </section>
      <section v-if="thirdPartyAllowed" class="appearance-section">
        <h3>{{ copy.skins }}</h3>
        <div class="extension-skin-list">
          <button v-for="option in skins" :key="option.value" type="button" class="product-control"
            :aria-pressed="activeId === option.value" @click="emit('select', option.value)">{{ option.label }}</button>
        </div>
        <label class="product-control skin-import">
          {{ copy.importSkin }}
          <input type="file" accept=".wskin" :disabled="importing" @change="readSkin" />
        </label>
        <p v-if="error" class="appearance-error" role="alert">{{ error }}</p>
      </section>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import type { SiteLanguage } from "../../../src/site-copy.js";
import { appearanceCopy } from "../i18n/appearance.js";
import { setInstanceAuthorization, thirdPartyAllowed } from "../services/instance-authorization.js";
import type { SkinOption } from "./SkinSwitcher.vue";

const props = defineProps<{
  language: SiteLanguage;
  adminLabel: string;
  native: boolean;
  activeId: string;
  skins: SkinOption[];
  importSkin: (file: File) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ select: [id: string] }>();
const copy = computed(() => appearanceCopy(props.language));
const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);
const menu = ref<HTMLDetailsElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const error = ref("");
const importing = ref(false);

function open() {
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
}
function restoreFocus() {
  if (menu.value?.open) trigger.value?.focus();
  else menu.value?.querySelector("summary")?.focus();
}
watch(thirdPartyAllowed, allowed => { if (!allowed) error.value = ""; });
async function readSkin(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !thirdPartyAllowed.value) return;
  importing.value = true;
  error.value = "";
  try { await props.importSkin(file); }
  catch { if (thirdPartyAllowed.value) error.value = copy.value.importError; }
  finally { importing.value = false; }
}
</script>
