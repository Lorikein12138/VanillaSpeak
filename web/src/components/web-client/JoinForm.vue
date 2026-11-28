<template>
  <form
    class="join-form"
    data-ws-part="home.form"
    @submit.prevent="emit('connect')"
  >
    <div
      v-if="accessMode === 'open'"
      class="field-grid target-fields"
      data-ws-part="home.server-target"
    >
      <label
        class="field-label"
        data-ws-part="home.field-label"
        for="server-address"
        ><span>{{ t("serverAddress") }}</span
        ><div
          class="field-wrap"
          data-ws-part="home.field"
          ><Icon
            name="server"
            :size="17" /><input
            id="server-address"
            v-model="serverHost"
            autocomplete="url"
            inputmode="url"
            autocapitalize="none"
            autocorrect="off"
            :spellcheck="false"
            enterkeyhint="next"
            :placeholder="t('serverAddressPlaceholder')" /></div
      ></label>
      <label
        class="field-label"
        data-ws-part="home.field-label"
        for="server-port"
        ><span>{{ t("serverPort") }}</span
        ><div
          class="field-wrap"
          data-ws-part="home.field"
          ><Icon
            name="hash"
            :size="17" /><input
            id="server-port"
            v-model="serverPort"
            inputmode="numeric"
            enterkeyhint="next"
            type="text"
            maxlength="5"
            :placeholder="t('serverPortPlaceholder')" /></div
      ></label>
    </div>
    <div
      v-if="openTargetPrefillBlocked"
      class="notice warning-notice"
      data-ws-part="home.notice"
      data-ws-state="target-prefill-blocked"
      ><span class="notice-symbol">i</span
      ><span>{{ t("openTargetDefaultNotPrefilled") }}</span></div
    >
    <div
      v-if="accelerationRelays.length"
      class="acceleration-choice"
      data-ws-part="home.relay-choice"
      ><div
        class="acceleration-copy"
        data-ws-part="home.relay-choice.copy"
        ><strong>{{ t("relayAcceleration") }}</strong
        ><small>{{ t("relayAccelerationHint") }}</small></div
      ><select
        v-model="accelerationRelayId"
        :aria-label="t('relayAcceleration')"
        ><option value="">{{ t("directConnection") }}</option
        ><option
          v-for="relay in accelerationRelays"
          :key="relay.id"
          :value="relay.id"
          >{{ relay.name }}</option
        ></select
      ></div
    >
    <div
      v-if="accessMode === 'open' && quickServers.length"
      class="local-servers"
      data-ws-part="home.server-history"
    >
      <div
        class="local-server-group"
        data-ws-part="home.server-history.group"
        ><span>{{ t("quickServers") }}</span
        ><div
          v-for="server in quickServers"
          :key="server.id"
          class="local-server-item"
          data-ws-part="home.server-history.item"
          :data-ws-state="server.isFavorite ? 'favorite' : 'recent'"
        ><button
          type="button"
          class="local-server-select"
          data-ws-part="home.server-history.select"
          :title="server.label + '\n' + server.address"
          :aria-label="t('switchToServer', { server: server.label })"
          @click="emit('selectServer', server.address, server.nickname, server.lastChannelHint?.name)"
          >{{ server.label }}</button
          ><button
            type="button"
            :class="['local-server-favorite', { active: server.isFavorite }]"
            data-ws-part="home.server-history.favorite-toggle"
            :data-ws-state="server.isFavorite ? 'saved' : 'unsaved'"
            :aria-label="server.isFavorite ? t('removeFavoriteForServer', { server: server.label }) : t('saveFavoriteForServer', { server: server.label })"
            :aria-pressed="server.isFavorite"
            @click.stop="emit('toggleQuickFavorite', server)"
          ><Icon name="star" :size="13" /></button
        ></div
        ></div
      >
    </div>
    <button
      v-if="accessMode === 'open' && serverHost.trim()"
      type="button"
      class="favorite-toggle"
      data-ws-part="home.favorite-toggle"
      @click="emit('toggleFavorite')"
      >{{ isFavorite ? t("removeFavorite") : t("saveFavorite") }}</button
    >

    <template v-if="accessMode === 'open'">
      <label
        class="field-label"
        data-ws-part="home.field-label"
        for="server-password"
        >{{ t("serverPassword") }} <span>{{ t("optional") }}</span></label
      >
      <div
        class="field-wrap"
        data-ws-part="home.field"
        ><Icon
          name="lock"
          :size="17" /><input
          id="server-password"
          v-model="serverPassword"
          type="password"
          autocomplete="off"
          :placeholder="t('optionalPassword')"
      /></div>
    </template>

    <label
      class="field-label"
      data-ws-part="home.field-label"
      for="nickname"
      >{{ t("nickname") }}</label
    >
    <div
      class="field-wrap"
      data-ws-part="home.field"
    >
      <Icon
        name="users"
        :size="17"
      />
      <input
        id="nickname"
        v-model="nickname"
        autocomplete="nickname"
        maxlength="30"
        :placeholder="t('nicknamePlaceholder')"
        :autofocus="autofocusNickname"
      />
    </div>

    <label
      class="field-label"
      data-ws-part="home.field-label"
      for="channel"
      >{{ t("targetChannel") }} <span>{{ t("optional") }}</span></label
    >
    <div class="field-wrap" data-ws-part="home.field">
      <Icon name="hash" :size="17" />
      <input
        id="channel"
        v-model="channel"
        :placeholder="t('emptyDefault')"
      />
    </div>

    <div class="identity-options" data-ws-part="home.identity">
      <div class="identity-controls">
        <label class="remember-identity">
          <span>
            <strong :id="identityLabel">{{ t("rememberIdentity") }}</strong>
            <small :id="identityHint">{{ t("rememberIdentityHint") }}</small>
          </span>
          <span class="identity-switch">
            <input
              v-model="rememberIdentity"
              type="checkbox"
              role="switch"
              :aria-labelledby="identityLabel"
              :aria-describedby="identityHint"
            />
            <span class="identity-track" aria-hidden="true"></span>
          </span>
        </label>
      </div>
      <div class="identity-actions" data-ws-part="home.identity-actions">
        <button
          type="button"
          class="identity-action-button"
          data-ws-part="home.identity-import.open"
          :aria-label="t('identityImport')"
          :title="t('identityImport')"
          @click="emit('importIdentity')"
        ><Icon name="download" :size="19" /></button>
        <button
          type="button"
          class="identity-action-button"
          data-ws-part="home.identity-export.button"
          :aria-label="t('identityExport')"
          :title="t('identityExport')"
          :disabled="identityExportBusy || !rememberIdentity || !hasIdentity"
          @click="emit('exportIdentity')"
        ><Icon name="upload" :size="19" /></button>
      </div>
    </div>
    <p
      v-if="rememberIdentity"
      class="identity-warning"
      >{{ t("rememberIdentityConcurrentWarning") }}</p
    >

    <button
      class="primary-button connect-button"
      data-ws-part="home.connect"
      :disabled="joinDisabled"
      type="submit"
    >
      <span
        v-if="connecting"
        class="button-spinner"
      ></span>
      <span>{{ connecting ? t("connecting") : t("joinVoice") }}</span>
    </button>
    <button
      v-if="connecting"
      type="button"
      class="cancel-connect-button"
      @click="emit('disconnect')"
      >{{ t("cancel") }}</button
    >
  </form>
</template>

<script setup lang="ts">
import { useId } from "vue";
import Icon from "../Icon.vue";
import type { QuickServer } from "../../services/quick-servers.js";

const serverHost = defineModel<string>("serverHost", { required: true });
const serverPort = defineModel<string>("serverPort", { required: true });
const serverPassword = defineModel<string>("serverPassword", { required: true });
const nickname = defineModel<string>("nickname", { required: true });
const channel = defineModel<string>("channel", { required: true });
const rememberIdentity = defineModel<boolean>("rememberIdentity", { required: true });
const accelerationRelayId = defineModel<string>("accelerationRelayId", { required: true });
const identityLabel = useId();
const identityHint = useId();

defineProps<{
  autofocusNickname?: boolean;
  accessMode: "fixed" | "open";
  openTargetPrefillBlocked: boolean;
  accelerationRelays: ReadonlyArray<{ id: string; name: string }>;
  quickServers: readonly QuickServer[];
  isFavorite: boolean;
  identityExportBusy: boolean;
  hasIdentity: boolean;
  connecting: boolean;
  joinDisabled: boolean;
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  connect: [];
  disconnect: [];
  importIdentity: [];
  exportIdentity: [];
  toggleFavorite: [];
  toggleQuickFavorite: [server: QuickServer];
  selectServer: [address: string, nickname?: string, channel?: string];
}>();
</script>

<style scoped>
.identity-options { margin-top: 8px; }
.identity-controls { border-block: 1px solid var(--rule); }
.remember-identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  padding-block: 7px;
  color: var(--ink);
  cursor: pointer;
}
.remember-identity strong, .remember-identity small { display: block; }
.remember-identity strong { font-size: 14px; }
.remember-identity small { color: var(--muted); font-size: 12px; line-height: 1.4; }
.identity-switch {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  height: 44px;
}
.identity-switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.identity-track {
  display: flex;
  align-items: center;
  width: 44px;
  height: 24px;
  padding-inline: 2px;
  border: 1px solid var(--control-border);
  border-radius: 999px;
  background: var(--sunken);
  color: var(--muted);
  pointer-events: none;
}
.identity-track::after {
  content: "";
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: currentColor;
  transition: transform 160ms ease;
}
.identity-switch input:checked + .identity-track {
  background: var(--action);
  border-color: var(--action);
  color: var(--on-action);
}
.identity-switch input:checked + .identity-track::after { transform: translateX(20px); }
.identity-switch input:focus-visible + .identity-track { outline: 2px solid var(--focus); outline-offset: 3px; }
@media (forced-colors: active) {
  .identity-track { forced-color-adjust: none; background: Canvas; color: CanvasText; border-color: CanvasText; }
  .identity-switch input:checked + .identity-track { background: Highlight; color: HighlightText; border-color: Highlight; }
}
.identity-actions {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-block: 3px;
}
.identity-actions::before {
  position: absolute;
  inset-inline-start: 50%;
  inset-block-start: calc(50% - 10px);
  width: 1px;
  height: 20px;
  background: var(--rule);
  content: "";
}
.identity-action-button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
}
.identity-action-button:hover:not(:disabled) { background: var(--selected); color: var(--action); }
.identity-action-button:disabled { opacity: .48; }
@media (max-width: 800px) {
  .identity-options { margin-top: 4px; }
  .remember-identity { min-height: 48px; padding-block: 2px; }
  .identity-actions { padding-block: 0; }
}
</style>
