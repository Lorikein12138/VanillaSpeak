<template>
  <details ref="menu" class="workspace-share-menu" @keydown.esc.stop.prevent="closeMenu">
    <summary ref="trigger" :title="t('screenShare')" :aria-label="t('screenShare')">
      <Icon name="monitor" :size="18" />
    </summary>
    <div class="workspace-share-actions">
      <button type="button" @click="share">
        <Icon :name="localSharing ? 'close' : 'monitor'" :size="16" />
        {{ t(localSharing ? 'stopScreenShare' : 'startScreenShare') }}
      </button>
      <button type="button" @click="showSettings">
        <Icon name="settings" :size="16" />
        {{ t('screenShareSettings') }}
      </button>
      <button v-for="{ member, streamId } in targets" :key="streamId" type="button"
        :aria-pressed="viewingStreamId === streamId" @click="watchShare(member)">
        <Icon name="monitor" :size="16" />
        <span>{{ t(viewingStreamId === streamId ? 'watching' : 'watchScreenShare') }} · {{ member.nickname }}</span>
      </button>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import type { ChannelMember } from '../../composables/useVoiceWebSocket.js';
import type { useWebClientScreenShare } from '../../composables/useWebClientScreenShare.js';

const props = defineProps<{
  members: ChannelMember[];
  model: Pick<ReturnType<typeof useWebClientScreenShare>, 'settingsOpen' | 'streamForMember' | 'toggleForMember' | 'startWithSettings'>;
  localSharing: boolean;
  viewingStreamId: string | null;
  t: (key: string) => string;
}>();
const emit = defineEmits<{ stopShare: [] }>();
const menu = ref<HTMLDetailsElement | null>(null);
const trigger = ref<HTMLElement | null>(null);
const targets = computed(() => props.members.flatMap(member => {
  if (member.isSelf) return [];
  const stream = props.model.streamForMember(member);
  return stream ? [{ member, streamId: stream.streamId }] : [];
}));

function closeMenu() {
  if (!menu.value?.open) return;
  menu.value.open = false;
  trigger.value?.focus();
}

function share() {
  closeMenu();
  if (props.localSharing) emit('stopShare');
  else void props.model.startWithSettings();
}

function showSettings() {
  closeMenu();
  props.model.settingsOpen.value = true;
}

function watchShare(member: ChannelMember) {
  closeMenu();
  props.model.toggleForMember(member);
}
</script>

<style scoped>
.workspace-share-menu { position: relative; flex: none; }
.workspace-share-menu summary {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--muted);
  list-style: none;
}
.workspace-share-menu summary::-webkit-details-marker { display: none; }
.workspace-share-menu[open] summary, .workspace-share-menu summary:hover {
  color: var(--action);
  background: var(--selected);
}
.workspace-share-actions {
  position: absolute;
  z-index: 12;
  inset: calc(100% + 6px) 0 auto auto;
  display: grid;
  gap: 3px;
  width: max-content;
  max-width: min(16rem, 80vw);
  max-height: min(20rem, 50dvh);
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--raised);
  box-shadow: var(--popover-shadow);
}
.workspace-share-actions button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 9px;
  border-radius: 6px;
  color: var(--ink);
  background: transparent;
  text-align: start;
  overflow-wrap: anywhere;
}
.workspace-share-actions button :deep(.ui-icon) { flex-shrink: 0; }
.workspace-share-actions button:hover, .workspace-share-actions button[aria-pressed="true"] {
  color: var(--action);
  background: var(--selected);
}
</style>
