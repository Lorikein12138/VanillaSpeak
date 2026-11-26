<template>
  <WebClientHeader
    v-if="!showVoiceShell"
    :inert="clearingLocalData"
    v-model:language="language"
    :skin-id="headerSkinId"
    :skin-options="skinOptions"
    :t="translate"
    @skin-change="onSkinChange"
    @language-change="persistLanguage"
    @preferences="openExtensionPreferences"
  />
  <ExtensionPreferences ref="extensionPreferences" :language="language"
    :active-id="activeSkinId" :skins="extensionSkinOptions" :import-skin="publicSkin.importLocal" @select="onSkinChange" />
  <div
    :class="[
      'web-client',
      'ws-skin-root',
      `language-${language}`,
      { 'skin-initializing': !skinReady, 'keyboard-open': mobileViewport.keyboardOpen },
    ]"
    :style="{ '--ws-viewport-height': `${mobileViewport.height}px`, '--ws-viewport-top': `${mobileViewport.top}px` }"
    :lang="language"
    data-ws-part="app"
    :data-ws-skin="activeSkinId"
    :data-ws-page="showVoiceShell ? 'voice' : 'home'"
  >
    <SkinPluginOutlet
      v-if="activeSkin"
      :skin-id="activeSkin.id"
      :skin-version="activeSkin.version"
      :document="skinPluginDocument"
      :page="showVoiceShell ? 'voice' : 'home'"
      :data="skinPluginContext"
      :assets="activeSkin.assets"
      :actions="skinPluginActions"
      :server-add-label="t('addFavoriteServer')"
      :on-add-server="openFavoriteServerDialog"
      :widgets="skinPluginWidgets"
      @surface-change="skinPluginSurfaceActive = $event"
      @restore-skin="switchToBuiltIn"
    />
    <SkinRuntimePluginHost
      v-if="activeSkin?.runtimePlugins"
      :skin-id="activeSkin.id"
      :skin-version="activeSkin.version"
      :plugins="activeSkin.runtimePlugins"
      :files="activeSkin.runtimePluginFiles ?? {}"
      :styles="activeSkin.runtimePluginStyles ?? {}"
      :assets="activeSkin.assets"
      :page="showVoiceShell ? 'voice' : 'home'"
      :mount-revision="accessMode"
      :context="skinPluginContext"
      :actions="skinPluginActions"
      :server-add-label="t('addFavoriteServer')"
      :on-add-server="openFavoriteServerDialog"
      :widgets="skinPluginWidgets"
      :read-session-status="readSkinRuntimeSessionStatus"
      @surface-change="skinRuntimePluginSurfaceActive = $event"
      @restore-skin="switchToBuiltIn"
    />
    <VoiceConnectionStatus
      v-if="voiceWorkspace.active.value && !skinPluginSurfaceActive && !skinRuntimePluginSurfaceActive && !favoriteServerDialogOpen && !serverPasswordDialog.open"
      class="workspace-connection-status"
      :connected="voiceState.connected"
      :connecting="voiceConnectionBusy"
      :nickname="nickname"
      :error="voiceConnectionError"
      :can-connect="canRequestVoiceConnection"
      :t="t"
      @update:nickname="nickname = $event"
      @connect="requestVoiceConnection"
    />
    <!-- Connection / welcome screen -->
    <section
      v-if="!showVoiceShell && !skinPluginSurfaceActive && !skinRuntimePluginSurfaceActive"
      class="join-page"
      data-ws-part="home"
    >
      <div class="ws-skin-mount-slot" data-ws-skin-mount="home.header.after"></div>

      <main
        class="join-content"
        data-ws-part="home.content"
        :inert="clearingLocalData"
      >
        <div class="ws-skin-mount-slot" data-ws-skin-mount="home.content.before"></div>
        <div
          class="join-copy"
          data-ws-part="home.hero"
        >
          <div
            class="eyebrow"
            data-ws-part="home.hero.eyebrow"
            ><span v-if="activeSkin" class="eyebrow-dot"></span>{{ skinHomeCopy.eyebrow || t(clubLobby ? "clubLounge" : "privateAudio") }}</div
          >
          <h1 data-ws-part="home.hero.title"
            >{{ skinHomeCopy.title || t(clubLobby ? "clubLine1" : "joinLine1") }}<br /><em>{{
              skinHomeCopy.titleAccent || t(clubLobby ? "clubLine2" : "joinLine2")
            }}</em></h1
          >
          <p v-if="accessMode === 'open' && siteName !== PRODUCT_NAME && siteName !== 'WebSpeak'" class="instance-name">{{ siteName }}</p>
          <p
            class="join-description"
            data-ws-part="home.hero.description"
            >{{ skinHomeCopy.description || homeWelcomeText }}</p
          >
          <div v-if="!activeSkin" class="join-voice-wave" aria-hidden="true">
            <i v-for="bar in 13" :key="bar"></i>
          </div>
          <div
            class="promise-list"
            data-ws-part="home.features"
          >
            <div
              v-for="feature in skinHomeFeatures"
              :key="feature.id"
              class="promise-item"
              data-ws-part="home.feature"
              :data-ws-feature-id="feature.id"
              ><span v-if="activeSkin" :class="['promise-icon', feature.tone]"
                ><Icon
                  :name="feature.icon"
                  :size="16" /></span
              ><span
                ><b>{{ feature.title }}</b
                ><small>{{ feature.description }}</small></span
              ></div
            >
          </div>
          <VisitorCount
            v-if="visitorNumber !== null"
            :current-label="t('visitorCount', { count: visitorNumber })"
            :total-label="visitorTotal === null ? undefined : t('visitorTotal', { count: visitorTotal })"
          />
        </div>

        <div
          class="join-card"
          data-ws-part="home.join-card"
        >
          <h2 data-ws-part="home.join-title">{{
            skinHomeCopy.welcomeTitle || t("joinVoice")
          }}</h2>
          <p
            v-if="activeSkin"
            class="card-lead"
            data-ws-part="home.join-description"
            >{{ skinHomeCopy.welcomeDescription || t("joinLead") }}</p
          >
          <div v-if="initialized && accessMode === 'fixed'" class="join-server">
            <span class="join-server-icon"><Icon name="headset" :size="20" /></span>
            <strong>{{ fixedServerName }}</strong>
          </div>

          <div
            v-if="voiceState.error"
            class="notice error-notice"
            data-ws-part="home.notice"
            data-ws-state="error"
            ><span class="notice-symbol">!</span
            ><span class="notice-content"
              ><span>{{ localizedMessage(voiceState.error) }}</span
              ><code v-if="voiceState.errorCode"
                >{{ t("errorCode") }}: {{ visibleErrorCode(voiceState.errorCode) }}</code
              ></span
            ></div
          >
          <div
            v-if="browserError"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="warning"
            ><span class="notice-symbol">i</span
            ><span>{{ localizedMessage(browserError) }}</span></div
          >
          <div
            v-if="!serverConfigLoading && !serverConfigUnavailable && !initialized"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="unconfigured"
            ><span class="notice-symbol">i</span
            ><span
              >{{ t("notConfigured") }} <a href="/admin">{{ t("configureNow") }}</a></span
            ></div
          >
          <div
            v-if="!localPersistenceAvailable"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="storage-warning"
            ><span class="notice-symbol">i</span
            ><span>{{ t("localPersistenceUnavailable") }}</span></div
          >

          <p v-if="serverConfigLoading" class="gateway-notice" role="status">{{ appearanceCopy(language).loading }}</p>
          <div v-else-if="serverConfigUnavailable" class="gateway-notice appearance-error" role="alert">
            {{ appearanceCopy(language).unavailable }}
            <button type="button" class="product-control" @click="loadPublicConfig">{{ appearanceCopy(language).retry }}</button>
          </div>

          <JoinForm
            v-if="initialized"
            :autofocus-nickname="!isMobileViewport"
            v-model:server-host="serverHost"
            v-model:server-port="serverPort"
            v-model:server-password="serverPassword"
            v-model:nickname="nickname"
            v-model:channel="channel"
            v-model:remember-identity="rememberIdentity"
            v-model:acceleration-relay-id="accelerationRelayId"
            :access-mode="accessMode"
            :open-target-prefill-blocked="openTargetPrefillBlocked"
            :acceleration-relays="accelerationRelays"
            :quick-servers="quickServers"
            :is-favorite="isFavorite"
            :identity-export-busy="identityExportBusy"
            :has-identity="Boolean(identityMaterial)"
            :connecting="voiceState.connecting"
            :join-disabled="
              !canJoin || serverConfigLoading || !identityReady || voiceState.connecting
            "
            :t="t"
            @connect="doConnect"
            @disconnect="doDisconnect"
            @select-server="selectLocalServer"
            @toggle-favorite="toggleFavorite"
            @toggle-quick-favorite="toggleQuickFavorite"
            @import-identity="openIdentityImport"
            @export-identity="exportIdentity"
          />
        </div>
        <div class="ws-skin-mount-slot" data-ws-skin-mount="home.content.after"></div>
      </main>

      <footer
        class="join-footer"
        data-ws-part="home.footer"
      >
        <div class="ws-skin-mount-slot" data-ws-skin-mount="home.footer.before"></div>
        <span data-ws-part="home.footer.decoration">© 2022 - 2026 VanillaClub</span>
        <span class="footer-spacer"></span
        ><button
          type="button"
          class="clear-local-button"
          data-ws-part="home.footer.clear"
          :title="t('clearLocalData')"
          :aria-label="t('clearLocalData')"
          :disabled="clearingLocalData"
          @click="clearBrowserData"
          ><Icon name="trash" :size="20" /></button
        >
      </footer>

    </section>

    <!-- Connected application shell -->
    <div
      v-else-if="showVoiceShell && !skinPluginSurfaceActive && !skinRuntimePluginSurfaceActive"
      :class="['app-shell', `mobile-view-${mobileSection}`, { 'default-desktop-workspace': defaultDesktopWorkspace }]"
      :data-performance-open="performancePanelOpen ? 'true' : 'false'"
      :data-favorite-rail="'true'"
      data-ws-part="voice.shell"
      @click="memberMenu = null"
    >
      <aside
        class="favorite-server-rail"
        data-ws-part="voice.favorite-servers.rail"
        :aria-label="t('quickServers')"
      >
        <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.server-rail.before"></div>
        <div class="favorite-server-rail-list" data-ws-part="voice.favorite-servers.rail.list">
          <div
            v-for="server in quickServersForDisplay"
            :key="server.id"
            class="favorite-server-rail-item"
            data-ws-part="voice.favorite-servers.rail.item"
            :data-ws-state="server.isFavorite ? 'favorite' : 'recent'"
          >
          <button
              type="button"
              :class="['favorite-server-button', { active: isQuickServerTarget(server) }]"
              data-ws-part="voice.favorite-servers.server"
              :data-ws-state="isQuickServerTarget(server) ? 'current' : 'idle'"
              :data-ws-server-kind="server.isFavorite ? 'favorite' : 'recent'"
              :aria-label="t('switchToServer', { server: server.label })"
              :aria-pressed="isQuickServerTarget(server)"
              :disabled="voiceState.connecting && isQuickServerTarget(server)"
              :aria-disabled="!serverCanSwitch(server)"
              :title="serverCanSwitch(server) ? server.label + '\n' + server.address : t('serverSwitchRestricted')"
              @click.stop="connectQuickServer(server)"
            >
              <span class="favorite-server-avatar" data-ws-part="voice.favorite-servers.avatar" :style="avatarStyle(server.label)"><img v-if="server.serverIcon" :src="server.serverIcon" alt="" aria-hidden="true" /><template v-else>{{ avatarInitial(server.serverName || server.label) }}</template></span>
              <span class="favorite-server-tooltip" data-ws-part="voice.favorite-servers.tooltip"><strong>{{ server.label }}</strong><small>{{ server.address }}</small></span>
            </button>
            <button
              type="button"
              :class="['favorite-server-toggle', { active: server.isFavorite }]"
              data-ws-part="voice.favorite-servers.favorite-toggle"
              :data-ws-state="server.isFavorite ? 'saved' : 'unsaved'"
              :aria-label="server.isFavorite ? t('removeFavoriteForServer', { server: server.label }) : t('saveFavoriteForServer', { server: server.label })"
              :title="server.isFavorite ? t('removeFavorite') : t('saveFavorite')"
              :aria-pressed="server.isFavorite"
              @click.stop="toggleQuickFavorite(server)"
            >
              <Icon name="star" :size="11" />
            </button>
          </div>
        </div>
        <button
          type="button"
          class="favorite-server-add"
          data-ws-part="voice.favorite-servers.add"
          :aria-label="t('addFavoriteServer')"
          :title="t('addFavoriteServer')"
          @click.stop="openFavoriteServerDialog"
        ><Icon name="plus" :size="20" /></button>
        <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.server-rail.after"></div>
      </aside>

      <nav
        class="favorite-server-strip"
        data-ws-part="voice.favorite-servers.strip"
        :aria-label="t('quickServers')"
      >
        <div
          v-for="server in quickServersForDisplay"
          :key="server.id"
          class="favorite-server-strip-item"
          data-ws-part="voice.favorite-servers.strip.item"
          :data-ws-state="server.isFavorite ? 'favorite' : 'recent'"
        ><button
          type="button"
          :class="['favorite-server-strip-button', { active: isQuickServerTarget(server) }]"
          data-ws-part="voice.favorite-servers.strip.server"
          :data-ws-state="isQuickServerTarget(server) ? 'current' : 'idle'"
          :data-ws-server-kind="server.isFavorite ? 'favorite' : 'recent'"
          :aria-label="t('switchToServer', { server: server.label })"
          :aria-pressed="isQuickServerTarget(server)"
          :disabled="voiceState.connecting && isQuickServerTarget(server)"
          :aria-disabled="!serverCanSwitch(server)"
          :title="serverCanSwitch(server) ? server.label : t('serverSwitchRestricted')"
          @click="connectQuickServer(server)"
        ><span class="favorite-server-avatar" data-ws-part="voice.favorite-servers.avatar" :style="avatarStyle(server.label)"><img v-if="server.serverIcon" :src="server.serverIcon" alt="" aria-hidden="true" /><template v-else>{{ avatarInitial(server.serverName || server.label) }}</template></span><span>{{ server.label }}</span></button
          ><button
            type="button"
            :class="['favorite-server-strip-toggle', { active: server.isFavorite }]"
            data-ws-part="voice.favorite-servers.strip.favorite-toggle"
            :data-ws-state="server.isFavorite ? 'saved' : 'unsaved'"
            :aria-label="server.isFavorite ? t('removeFavoriteForServer', { server: server.label }) : t('saveFavoriteForServer', { server: server.label })"
            :title="server.isFavorite ? t('removeFavorite') : t('saveFavorite')"
            :aria-pressed="server.isFavorite"
            @click.stop="toggleQuickFavorite(server)"
          ><Icon name="star" :size="11" /></button
        ></div>
        <button
          type="button"
          class="favorite-server-strip-add"
          data-ws-part="voice.favorite-servers.strip.add"
          :aria-label="t('addFavoriteServer')"
          :title="t('addFavoriteServer')"
          @click="openFavoriteServerDialog"
        ><Icon name="plus" :size="18" /></button>
      </nav>

      <div
        v-if="isMobileViewport && (favoriteSwitchPending || favoriteSwitchFailed)"
        :class="['favorite-switch-banner', 'favorite-switch-mobile-banner', { failed: favoriteSwitchFailed }]"
        data-ws-part="voice.favorite-servers.switch-status"
        :data-ws-state="favoriteSwitchFailed ? 'failed' : 'connecting'"
        role="status"
        aria-live="polite"
      >
        <span class="favorite-switch-indicator"><Icon :name="favoriteSwitchFailed ? 'info' : 'server'" :size="17" /></span>
        <span class="favorite-switch-copy">
          <strong>{{ favoriteSwitchFailed ? t('favoriteConnectionFailed', { server: favoriteSwitchLabel }) : t('favoriteSwitching', { server: favoriteSwitchLabel }) }}</strong>
          <small v-if="favoriteSwitchPending">{{ t('connecting') }}</small>
          <small v-else>{{ favoriteSwitchError || t('quickConnectFailed') }}</small>
        </span>
        <button v-if="favoriteSwitchFailed" type="button" @click="leaveVoiceWorkspace">{{ t('back') }}</button>
      </div>

      <main
        class="workspace"
        data-ws-part="voice.workspace"
      >
        <header
          class="workspace-header"
          data-ws-part="voice.header"
        >
          <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.header.before"></div>
          <div
            class="breadcrumbs"
            data-ws-part="voice.breadcrumbs"
            ><span class="mobile-brand">{{ PRODUCT_NAME }}</span
            ><span class="crumb-muted">{{ t("serverBreadcrumb") }}</span
            ><Icon
              name="chevron-right"
              :size="14"
            /><strong>{{ currentChannelName }}</strong></div
          >
          <div
            class="workspace-actions"
            data-ws-part="voice.header-actions"
          >
            <VoicePerformancePanel
              :model="performance"
              :screen-share-web-rtc-stats="screenShareWebRtcStats"
              :t="t"
            />
            <div id="webspeak-plugin-toolbar" ref="pluginToolbarTarget" class="webspeak-plugin-toolbar-host" data-ws-part="voice.plugin-toolbar"></div>
            <WorkspaceScreenShareMenu
              v-if="defaultDesktopWorkspace && voiceState.connected"
              :members="currentMembers"
              :model="screenShareControls"
              :local-sharing="screenShareActive || screenShareStarting"
              :viewing-stream-id="screenShareViewingStreamId"
              :t="t"
              @stop-share="stopScreenShare"
            />
            <button
              type="button"
              class="header-action"
              :title="t('copyInvite')"
              :aria-label="t('copyInvite')"
              @click="doShare"
              ><Icon
                name="share"
                :size="18"
            /></button>
            <button
              v-if="accessMode === 'open'"
              :class="['header-action', 'favorite-current-toggle', { active: isFavorite }]"
              data-ws-part="voice.favorite-servers.current-toggle"
              :data-ws-state="isFavorite ? 'saved' : 'unsaved'"
              :title="t(isFavorite ? 'removeFavorite' : 'saveFavorite')"
              :aria-label="t(isFavorite ? 'removeFavorite' : 'saveFavorite')"
              :aria-pressed="isFavorite"
              @click="toggleFavorite"
            ><Icon name="star" :size="18" /></button>
            <button
              v-if="isMobileViewport"
              class="header-action microphone-header-toggle"
              :class="{ muted: microphoneMuted }"
              :title="microphoneMuted ? t('unmuteMic') : t('muteMic')"
              :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
              :aria-pressed="!microphoneMuted"
              @click="toggleMicrophone"
              ><Icon
                :name="microphoneMuted ? 'mic-off' : 'mic'"
                :size="18"
            /></button>
            <button
              v-if="isMobileViewport"
              class="header-action"
              :title="t('audioSettings')"
              :aria-label="t('audioSettings')"
              @click="settingsOpen = true"
              ><Icon
                name="settings"
                :size="18"
            /></button>
            <SkinSwitcher
              :model-value="headerSkinId"
              class="workspace-skin-switcher"
              :menu-label="t('skinSelector')"
              :preferences-label="appearanceCopy(language).preferences"
              :options="skinOptions"
              icon-only
              @change="onSkinChange"
              @preferences="openExtensionPreferences"
            />
            <LanguageSwitcher skin-icon icon-only
              v-model="language"
              class="workspace-language"
              :menu-label="t('languageMenu')"
              @change="persistLanguage"
            />
            <button
              type="button"
              class="disconnect-button"
              :aria-label="t('exit')"
              :title="t('exit')"
              @click="leaveVoiceWorkspace"
            ><Icon
                name="door"
                :size="17"
              /></button
            >
          </div>
          <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.header.after"></div>
        </header>

        <div
          v-if="!isMobileViewport && (favoriteSwitchPending || favoriteSwitchFailed)"
          :class="['favorite-switch-banner', { failed: favoriteSwitchFailed }]"
          data-ws-part="voice.favorite-servers.switch-status"
          :data-ws-state="favoriteSwitchFailed ? 'failed' : 'connecting'"
          role="status"
          aria-live="polite"
        >
          <span class="favorite-switch-indicator"><Icon :name="favoriteSwitchFailed ? 'info' : 'server'" :size="17" /></span>
          <span class="favorite-switch-copy">
            <strong>{{ favoriteSwitchFailed ? t('favoriteConnectionFailed', { server: favoriteSwitchLabel }) : t('favoriteSwitching', { server: favoriteSwitchLabel }) }}</strong>
            <small v-if="favoriteSwitchPending">{{ t('connecting') }}</small>
            <small v-else>{{ favoriteSwitchError || t('quickConnectFailed') }}</small>
          </span>
          <button v-if="favoriteSwitchFailed" type="button" @click="leaveVoiceWorkspace">{{ t('back') }}</button>
        </div>

        <div
          v-if="voiceState.reconnecting || voiceState.reconnectFailed"
          :class="['reconnect-banner', { failed: voiceState.reconnectFailed }]"
          data-ws-part="voice.connection-status"
          role="status"
        >
          <div class="reconnect-copy"
            ><strong>{{
              voiceState.reconnectFailed ? t("reconnectFailed") : t("connectionInterrupted")
            }}</strong
            ><span v-if="voiceState.reconnecting">{{
              t("reconnectingAttempt", { attempt: voiceState.reconnectAttempt })
            }}</span
            ><span v-else>{{ localizedMessage(voiceState.error) }}</span></div
          >
          <div class="reconnect-actions"
            ><button
              v-if="voiceState.reconnectFailed"
              type="button"
              class="secondary-button"
              @click="reconnectMobile"
              >{{ t("reconnectNow") }}</button
            ><button
              type="button"
              class="text-button"
              @click="leaveVoiceWorkspace"
              >{{ t("back") }}</button
            ></div
          >
        </div>
        <div
          v-if="voiceState.audioNotice"
          class="reconnect-banner degraded"
          data-ws-part="voice.audio-status"
          role="status"
          ><div class="reconnect-copy"
            ><strong>{{ t("audioStatus") }}</strong
            ><span>{{
              localizedAudioNotice(voiceState.audioNoticeCode, voiceState.audioNotice)
            }}</span></div
          ></div
        >
        <div
          v-for="poke in visiblePokes"
          :key="poke.id"
          class="poke-banner"
          data-ws-part="voice.poke"
          role="status"
          ><Icon
            name="bell"
            :size="17" /><span
            ><strong>{{ poke.invokerName }}</strong> {{ t("pokedYou")
            }}<small v-if="poke.message">：{{ poke.message }}</small></span
          ><button
            type="button"
            @click="dismissPoke(poke.id)"
            ><Icon
              name="close"
              :size="15" /></button
        ></div>

        <div
          class="workspace-scroll"
          data-ws-part="voice.scroll"
        >
          <div
            class="workspace-content"
            data-ws-part="voice.content"
          >
            <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.activity.before"></div>
            <section
              v-if="!defaultDesktopWorkspace || screenShareError || screenShareViewing || whisperTargetIds.size"
              :class="['voice-section', { 'mobile-section-hidden': mobileSection !== 'voice' }]"
              data-ws-part="voice.activity"
            >
              <div
                v-if="!defaultDesktopWorkspace"
                class="voice-activity-artwork"
                data-ws-part="voice.activity.artwork"
                aria-hidden="true"
              ></div>
              <div
                v-if="!defaultDesktopWorkspace"
                class="section-heading"
                data-ws-part="voice.activity-heading"
                ><div
                  ><span class="section-kicker">{{ t("voiceActivity") }}</span
                  ><h2>{{ t("speakingNow") }}</h2></div
                ><span class="section-counter">{{
                  t("onlineShort", { count: currentMembers.length })
                }}</span></div
              >
              <div
                v-if="screenShareError"
                class="screen-share-inline-error"
                data-ws-part="voice.screen-share-error"
                role="status"
                ><Icon
                  name="info"
                  :size="15"
                /> <span>{{ screenShareErrorText }}</span></div
              >
              <ScreenSharePlayer
                v-if="screenShareViewing"
                :model="screenShareControls"
                :screen-share-remote-stream="screenShareRemoteStream"
                :screen-share-remote-volume="screenShareRemoteVolume"
                :screen-share-error="screenShareError"
                :leave-screen-share="leaveScreenShare"
                :avatar-initial="avatarInitial"
                :t="t"
              />
              <VoiceMemberCards
                v-if="!defaultDesktopWorkspace"
                :current-members="currentMembers"
                :is-mobile-viewport="isMobileViewport"
                :show-screen-share="true"
                :sharing="memberSharingState"
                :controls="screenShareControls"
                :is-speaking="isSpeaking"
                :avatar-style="avatarStyle"
                :avatar-initial="avatarInitial"
                :t="t"
                @member-actions="openMemberActions"
                @stop-share="stopScreenShare"
              />
              <WhisperControls
                v-if="whisperTargetIds.size"
                :targets="whisperTargets"
                :active="whisperActive"
                :enabled="!isMobileViewport || mobileSection === 'voice'"
                :controls="audioControls"
                :t="t"
                @clear="clearWhisperTargets"
              />
              <div class="mobile-voice-controls">
                <button
                  type="button"
                  class="mobile-voice-toggle"
                  :class="{ muted: microphoneMuted }"
                  :aria-label="t('microphone')"
                  :title="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
                  :aria-pressed="!microphoneMuted"
                  @click="toggleMicrophone"
                  ><Icon
                    :name="microphoneMuted ? 'mic-off' : 'mic'"
                    :size="18"
                  /><span>{{ t("microphone") }}</span></button
                >
                <button
                  type="button"
                  class="mobile-voice-toggle"
                  :class="{ muted: outputMuted }"
                  :aria-label="t('speaker')"
                  :title="outputMuted ? t('outputMuted') : t('speaker')"
                  :aria-pressed="!outputMuted"
                  @click="toggleOutputMute"
                  ><Icon :name="outputMuted ? 'volume-off' : 'volume'" :size="18" /><span>{{ t("speaker") }}</span></button
                >
                <button type="button" class="mobile-voice-leave" :aria-label="t('exit')" :title="t('exit')" @click="leaveVoiceWorkspace"><Icon name="door" :size="17" /></button
                >
              </div>
            </section>

            <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.activity.after"></div>
            <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.chat.before"></div>
            <ChatPanel
              class="workspace-chat"
              :model="chat"
              :t="t"
              :current-channel-name="currentChannelName"
              :mobile-hidden="mobileSection !== 'chat'"
              :server-events="serverEvents"
              :avatar-style="avatarStyle"
              :avatar-initial="avatarInitial"
              :message-avatar="messageAvatar"
              :format-time="formatTime"
            />
            <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.chat.after"></div>
          </div>
        </div>
      </main>

      <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.channel-panel.before"></div>
      <ChannelMemberPanel
        v-model:query="memberQuery"
        :model="memberControls"
        :filtered-member-channels="filteredMemberChannels"
        :current-channel-id="currentChannel?.id"
        :mobile-visible="mobileSection === 'channels'"
        :is-mobile-viewport="isMobileViewport"
        :volumes="volumes"
        :avatar-style="avatarStyle"
        :avatar-initial="avatarInitial"
        :range-style="rangeStyle"
        :t="t"
        @select-channel="selectChannel"
        @volume-input="onVolInput"
      >
        <div v-if="isMobileViewport" class="mobile-member-controls" role="toolbar" :aria-label="t('desktopAudioControls')">
          <button type="button" class="mobile-voice-toggle" :class="{ muted: microphoneMuted }" :aria-label="t('microphone')" :title="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" :aria-pressed="!microphoneMuted" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="20" /><span>{{ t('microphone') }}</span></button>
          <button type="button" class="mobile-voice-toggle" :class="{ muted: outputMuted }" :aria-label="t('speaker')" :title="outputMuted ? t('outputMuted') : t('speaker')" :aria-pressed="!outputMuted" @click="toggleOutputMute"><Icon :name="outputMuted ? 'volume-off' : 'volume'" :size="20" /><span>{{ t('speaker') }}</span></button>
          <button type="button" class="mobile-member-leave" :aria-label="t('exit')" :title="t('exit')" @click="leaveVoiceWorkspace"><Icon name="door" :size="18" /></button>
        </div>
        <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.audio-dock.before"></div>
        <AudioDock
          v-if="!isMobileViewport"
          :model="audioDockState"
          :controls="audioControls"
          :t="t"
          :range-style="rangeStyle"
          @settings="settingsOpen = true"
          @output-mute="toggleOutputMute"
        />
        <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.audio-dock.after"></div>
      </ChannelMemberPanel>
      <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.channel-panel.after"></div>

      <section
        v-if="mobileSection === 'more'"
        class="mobile-more-panel"
        data-ws-part="voice.mobile-more"
      >
        <span class="section-kicker">{{ t("mobileMore") }}</span>
        <h2>{{ t("mobileMore") }}</h2>
        <button
          type="button"
          :class="{ muted: microphoneMuted }"
          @click="toggleMicrophone"
          ><Icon
            :name="microphoneMuted ? 'mic-off' : 'mic'"
            :size="18"
          />
          {{ microphoneMuted ? t("unmuteMic") : t("muteMic") }}</button
        >
        <button
          type="button"
          @click="settingsOpen = true"
          ><Icon
            name="settings"
            :size="18"
          />
          {{ t("audioSettings") }}</button
        >
        <SkinSwitcher
          :model-value="headerSkinId"
          class="mobile-skin-switcher"
          :menu-label="t('skinSelector')"
          :preferences-label="appearanceCopy(language).preferences"
          :options="skinOptions"
          @change="onSkinChange"
          @preferences="openExtensionPreferences"
        />
        <div class="language-menu-row"
          ><Icon
            name="globe"
            :size="18" /><span>{{ t("languageMenu") }}</span
          ><LanguageSwitcher skin-icon
            v-model="language"
            :menu-label="t('languageMenu')"
            @change="persistLanguage"
        /></div>
        <button
          type="button"
          class="danger"
          @click="leaveVoiceWorkspace"
          ><Icon
            name="door"
            :size="18"
          />
          {{ t("exit") }}</button
        >
      </section>

      <nav
        class="mobile-nav"
        data-ws-part="voice.mobile-nav"
        :aria-label="t('mobileNavigation')"
      >
        <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.mobile-nav.before"></div>
        <button
          type="button"
          :class="{ active: mobileSection === 'channels' }"
          :aria-current="mobileSection === 'channels' ? 'page' : undefined"
          @click="selectMobileSection('channels')"
          ><Icon
            name="volume"
            :size="18"
          /><span>{{ t("mobileChannels") }}</span></button
        >
        <button
          type="button"
          :class="{ active: mobileSection === 'chat' }"
          :aria-current="mobileSection === 'chat' ? 'page' : undefined"
          @click="selectMobileSection('chat')"
          ><Icon
            name="message"
            :size="18"
          /><span>{{ t("mobileChat") }}</span></button
        >
        <button
          type="button"
          :class="{ active: mobileSection === 'voice' }"
          :aria-current="mobileSection === 'voice' ? 'page' : undefined"
          @click="selectMobileSection('voice')"
          ><Icon
            name="mic"
            :size="18"
          /><span>{{ t("mobileVoice") }}</span></button
        >
        <button
          type="button"
          :class="{ active: mobileSection === 'more' }"
          :aria-current="mobileSection === 'more' ? 'page' : undefined"
          @click="selectMobileSection('more')"
        ><Icon
            name="more"
            :size="18"
          /><span>{{ t("mobileMore") }}</span></button
        >
        <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.mobile-nav.after"></div>
      </nav>
      <div class="ws-skin-mount-slot" data-ws-skin-mount="voice.workspace.overlay"></div>
    </div>

    <PluginPanel :session-token="pluginSession" :gateway-url="pluginVoiceSocket?.url ?? ''" :connected="voiceState.connected" :language="language" :toolbar-target="skinPluginToolbar?.element ?? pluginToolbarTarget" :presentation="skinPluginToolbar?.presentation ?? (OFFICIAL_SKIN_IDS.has(activeSkinId) ? 'drawer-below' : 'dialog')" />
    <HostChrome :language="language" :connected="voiceState.connected" :plugin-library-available="voiceState.connected && Boolean(pluginSession)"
      :preferences-available="showVoiceShell && Boolean(activeSkin)" @preferences="openExtensionPreferences" />
    <IdentityImportDialog
      v-if="identityImportOpen"
      v-model="identityImportText"
      :busy="identityImportBusy"
      :reading="identityFileReading"
      :error="identityImportError"
      :t="t"
      @close="closeIdentityImport"
      @submit="importIdentity"
      @file="readIdentityFile"
    />

    <ScreenShareSettingsDialog
      v-if="screenShareSettingsOpen"
      :model="screenShareControls"
      :t="t"
      @close="screenShareSettingsOpen = false"
    />

    <MemberActionsMenu
      :model="memberControls"
      :is-mobile-viewport="isMobileViewport"
      :volumes="volumes"
      :whisper-target-ids="whisperTargetIds"
      :range-style="rangeStyle"
      :t="t"
      @private-chat="openPrivateChat"
      @volume-input="onVolInput"
    />

    <WorkspaceInviteDialog v-if="inviteDialogOpen && voiceState.connected" :t="t" :create="createInvite" @close="inviteDialogOpen = false" />

    <!-- Protected channel password modal -->
    <ChannelPasswordDialog
      v-if="channelPasswordDialog.open"
      v-model="channelPasswordDialog.password"
      :busy="channelPasswordDialog.submitting"
      :error="channelPasswordDialog.error"
      :submit-label="skinMessageOverrides.passwordDialogConfirm"
      :t="t"
      @cancel="cancelChannelPassword"
      @submit="submitChannelPassword"
    />

    <!-- TeamSpeak server password modal -->
    <ServerPasswordDialog
      v-if="serverPasswordDialog.open"
      v-model="serverPasswordDialog.password"
      :error-code="serverPasswordDialog.errorCode"
      :submit-label="skinMessageOverrides.passwordDialogConfirm"
      :t="t"
      @cancel="cancelFavoriteServerPassword"
      @submit="submitServerPassword"
    />

    <FavoriteServerDialog
          :open="favoriteServerDialogOpen"
          :busy="favoriteDialogBusy"
          :default-nickname="nickname"
          :t="t"
          @close="favoriteServerDialogOpen = false"
      @submit="submitFavoriteServerDraft"
    />

    <!-- Audio settings modal -->
    <AudioSettingsDialog
      v-if="settingsOpen"
      :model="audioSettingsState"
      :controls="audioControls"
      :microphone-error="voiceState.microphoneError"
      :t="t"
      :localized-message="localizedMessage"
      :range-style="rangeStyle"
      @close="settingsOpen = false"
    />

    <div
      v-if="toast"
      class="toast"
      data-ws-part="app.toast"
      role="status"
      ><Icon
        name="check"
        :size="16"
      />
      {{ toast }}</div
    >
  </div>
  <SkinLoadRecoveryNotice :error="skinLoadError" :language="language" @use-built-in="switchToBuiltInAfterLoadError" />
</template>

<script setup lang="ts">
import { observeMobileViewport } from "../services/mobile-viewport.js";
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from "vue";
import Icon from "../components/Icon.vue";
import VoiceConnectionStatus from "../components/web-client/VoiceConnectionStatus.vue";
import { useVoiceWorkspace } from "../composables/useVoiceWorkspace.js";
import SkinPluginOutlet from "../components/SkinPluginOutlet.js";
import SkinRuntimePluginHost from "../components/SkinRuntimePluginHost.js";
import SkinLoadRecoveryNotice from "../components/SkinLoadRecoveryNotice.vue";
import VoiceMemberCards from "../components/web-client/VoiceMemberCards.vue";
import WorkspaceScreenShareMenu from "../components/web-client/WorkspaceScreenShareMenu.vue";
import VoicePerformancePanel from "../components/web-client/VoicePerformancePanel.vue";
import VoiceChannelTree from "../components/web-client/VoiceChannelTree.vue";
import { channelDisplayName, getChannelSpacer } from "../../../src/shared/channel-spacer.js";
import VoiceServerSwitcher from "../components/web-client/VoiceServerSwitcher.vue";
import VoiceServerHeader from "../components/web-client/VoiceServerHeader.vue";
import VoiceServerBanner from "../components/web-client/VoiceServerBanner.vue";

import ScreenShareSettingsDialog from "../components/web-client/ScreenShareSettingsDialog.vue";
import ScreenSharePlayer from "../components/web-client/ScreenSharePlayer.vue";
import AudioDock from "../components/web-client/AudioDock.vue";
import WhisperControls from "../components/web-client/WhisperControls.vue";
import AudioSettingsDialog from "../components/web-client/AudioSettingsDialog.vue";
import ChannelPasswordDialog from "../components/web-client/ChannelPasswordDialog.vue";
import ServerPasswordDialog from "../components/web-client/ServerPasswordDialog.vue";
import ChannelMemberPanel from "../components/web-client/ChannelMemberPanel.vue";
import MemberActionsMenu from "../components/web-client/MemberActionsMenu.vue";
import JoinForm from "../components/web-client/JoinForm.vue";
import ChatPanel from "../components/web-client/ChatPanel.vue";
import { PRODUCT_NAME } from "../../../src/shared/product.js";
import ExtensionPreferences from "../components/ExtensionPreferences.vue";
import VisitorCount from "../components/web-client/VisitorCount.vue";
import { appearanceCopy } from "../i18n/appearance.js";
import WebClientHeader from "../components/web-client/WebClientHeader.vue";
import IdentityImportDialog from "../components/web-client/IdentityImportDialog.vue";
import FavoriteServerDialog, { type FavoriteServerDraft } from "../components/web-client/FavoriteServerDialog.vue";
import { usePublicSkin } from "../composables/usePublicSkin.js";
import { useWebClientIdentity } from "../composables/useWebClientIdentity.js";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import SkinSwitcher, { type SkinOption } from "../components/SkinSwitcher.vue";
import { useWebClientChat } from "../composables/useWebClientChat.js";
import { useWebClientAudioControls } from "../composables/useWebClientAudioControls.js";
import { useWebClientChannels, type TreeChannel } from "../composables/useWebClientChannels.js";
import { useWebClientConnection } from "../composables/useWebClientConnection.js";
import { useWebClientMembers } from "../composables/useWebClientMembers.js";
import PluginPanel from "../components/PluginPanel.vue";
import { OFFICIAL_SKIN_IDS } from "../services/instance-authorization.js";
import HostChrome from "../components/HostChrome.vue";
import WorkspaceInviteDialog from "../components/web-client/WorkspaceInviteDialog.vue";
import { useVoiceWebSocket, type ChannelMember, type ChatMessage } from "../composables/useVoiceWebSocket.js";
import { useWebClientScreenShare } from "../composables/useWebClientScreenShare.js";
import { useWebClientPerformance } from "../composables/useWebClientPerformance.js";
import { useWebClientI18n } from "../composables/useWebClientI18n.js";
import { useWebClientPublicConfig } from "../composables/useWebClientPublicConfig.js";
import { useWebClientServerHistory } from "../composables/useWebClientServerHistory.js";
import { getInitialLanguage, type Language } from "../i18n/web-client.js";
import { clearLocalData as clearStoredLocalData, isLocalPersistenceAvailable, loadLocalPreferences, loadStoredIdentity, removeStoredIdentity, saveLocalPreferences, saveStoredIdentity, type FavoriteServer } from "../services/local-persistence.js";
import { isQuickServerAddressLabel, quickServerTargetsEqual, type QuickServer } from "../services/quick-servers.js";
import { requestIdentityProviderLogin as dispatchIdentityProviderLogin } from "../services/identity-provider.js";
import type { InstalledSkin, SkinHomeCopy } from "../services/skin-pack.js";
import { BUILTIN_DARK_SKIN, BUILTIN_LIGHT_SKIN } from "../services/skin-runtime.js";
import { applyTheme, getStoredTheme, hostTheme } from "../services/theme.js";
import { createScreenWakeLockController, getScreenWakeLockApi, type ScreenWakeLockController, type ScreenWakeLockSnapshot } from "../services/screen-wake-lock.js";
import { createMobileAwayController, type MobileAwayController } from "../services/mobile-away.js";
import { createSkinPluginQuickServerProjection, safeSkinServerDisplayName } from "../services/skin-plugin-context.js";
import { resolveSkinMessages } from "../services/skin-content.js";
import type { SkinPluginDocument, SkinPluginWidgetOptions } from "../../../src/shared/skin-plugin.js";
import { combineTeamSpeakTarget, DEFAULT_TEAM_SPEAK_PORT, isValidTeamSpeakPort, splitTeamSpeakTarget } from "../services/teamspeak-target.js";

const {
  state: voiceState,
  serverInfo: voiceServerInfo,
  sessionEpoch,
  memberConversationKey,
  members,
  channels,
  chatMessages,
  serverEvents,
  pokeNotifications,
  microphoneMuted,
  noiseSuppressionEnabled,
  noiseSuppressionLevel,
  inputVolume,
  outputVolume,
  outputMuted,
  notificationVolume,
  voxThreshold,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  audioContextState,
  identityMaterial,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
  speakingIds,
  volumes,
  whisperTargetIds,
  whisperActive,
  setVolume,
  setInputVolume,
  setNoiseSuppressionLevel,
  setOutputVolume,
  toggleOutputMute,
  setVoxThreshold,
  setNotificationVolume,
  prepareInputDevices,
  refreshAudioDevices,
  setInputDevice,
  setOutputDevice,
  startMicrophoneTest,
  stopMicrophoneTest,
  playNotification,
  connect,
  reconnectNow,
  disconnect,
  switchChannel,
  moveClient,
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
  sendPoke,
  setAway,
  setWhisperTargets,
  setWhisperActive,
  setMicrophoneMuted,
  accompanimentActive,
  accompanimentErrorCode,
  screenShareStreams,
  screenShareActive,
  screenShareStarting,
  screenShareViewing,
  screenShareViewingStreamId,
  screenShareRemoteStream,
  screenShareError,
  screenShareErrorCode,
  screenShareRemoteVolume,
  screenShareWebRtcStats,
  startAccompaniment,
  stopAccompaniment,
  startScreenShare,
  stopScreenShare,
  joinScreenShare,
  leaveScreenShare,
  checkSupport,
  clearError,
  pluginSession,
  ws: pluginVoiceSocket,
  createInvite,
  measureVoiceAudioStatus,
  sessionTrace,
} = useVoiceWebSocket();
const performance = useWebClientPerformance(computed(() => voiceState.connected), measureVoiceAudioStatus, sessionTrace);
const { panelOpen: performancePanelOpen } = performance;

const query = new URLSearchParams(location.search);
const initialChannel = query.get("channel") ?? "";
const initialInviteToken = query.get("invite") ?? "";
const inviteToken = ref(initialInviteToken);
const initialTarget = initialServerTarget();
const nickname = ref(localStorage.getItem("webspeak:nickname") ?? "");
const channel = ref(initialChannel);
const serverHost = ref(initialTarget.address);
const serverPort = ref(initialTarget.port);
const serverPassword = ref("");
const rememberIdentity = ref(localStorage.getItem("webspeak:remember-identity") !== "0");
const accelerationRelayId = ref("");
const browserError = ref("");
const clearingLocalData = ref(false);
const memberQuery = ref("");
const channelTreeSearchQuery = ref("");
const selectedChannelId = ref("");
const settingsOpen = ref(false);
const favoriteServerDialogOpen = ref(false);
const favoriteDialogBusy = ref(false);
const favoriteSwitchPending = ref(false);
const favoriteSwitchFailed = ref(false);
const favoriteSwitchError = ref("");
const channelPasswordDialog = reactive({ open: false, channelId: "", password: "", error: "", submitting: false });
const serverPasswordDialog = reactive({ open: false, password: "", errorCode: "" });



const toast = ref("");
const localPersistenceAvailable = isLocalPersistenceAvailable();
const identityReady = ref(!localPersistenceAvailable);
const mobileSection = ref<"channels" | "chat" | "voice" | "more">("channels");
const isMobileViewport = ref(window.matchMedia("(max-width: 740px)").matches);
let mobileAwayController: MobileAwayController | undefined;
const shouldKeepScreenAwake = computed(() => isMobileViewport.value && (voiceState.connected || voiceState.connecting || voiceState.reconnecting));
const screenWakeLockState = ref<ScreenWakeLockSnapshot>({ supported: false, enabled: false, active: false, requesting: false, unavailable: false });
let screenWakeLockController: ScreenWakeLockController | undefined;
const mobileViewport = reactive({ height: window.innerHeight, top: 0, keyboardOpen: false });
let stopViewportObservation: (() => void) | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const language = ref<Language>(getInitialLanguage());
const activeSkin = shallowRef<InstalledSkin | null>(null);
const emptySkinPluginDocument: SkinPluginDocument = { schemaVersion: 3, components: [] };
const skinPluginDocument = computed<SkinPluginDocument>(() => {
  const skin = activeSkin.value;
  if (!skin) return emptySkinPluginDocument;
  return skin.pluginData ?? emptySkinPluginDocument;
});
const pluginToolbarTarget = ref<HTMLElement | null>(null);
const skinPluginToolbar = shallowRef<{ element: HTMLElement; presentation: NonNullable<SkinPluginWidgetOptions["pluginPresentation"]> } | null>(null);
const skinPluginSurfaceActive = ref(false);
const skinRuntimePluginSurfaceActive = ref(false);
watch(activeSkin, () => {
  skinPluginSurfaceActive.value = false;
  skinRuntimePluginSurfaceActive.value = false;
}, { flush: "sync" });
const skinMessageOverrides = computed(() => resolveSkinMessages(activeSkin.value?.contentData, language.value));
const { t: translate, localizedMessage, localizedAudioNotice, visibleErrorCode } = useWebClientI18n(language);
function t(key: string, variables: Record<string, string | number> = {}) {
  const template = skinMessageOverrides.value[key];
  // WebSpeak's own locale dictionaries are the complete baseline; a skin only
  // replaces non-empty strings it explicitly provides.
  if (template === undefined || !template.trim()) return translate(key, variables);
  return Object.entries(variables).reduce((value, [name, replacement]) => value.replaceAll(`{{${name}}}`, String(replacement)), template);
}
const {
  open: identityImportOpen, text: identityImportText, error: identityImportError,
  busy: identityImportBusy, reading: identityFileReading, exporting: identityExportBusy,
  show: openIdentityImport, close: closeIdentityImport, reset: resetIdentityOperations, restore: restoreIdentity,
  readFile: readIdentityFile, submit: importIdentity, exportIdentity,
} = useWebClientIdentity({ identityMaterial, rememberIdentity, t, showToast });
const {
  quickServers,
  recentServers,
  isFavorite,
  loadSavedServers,
  recordCurrentServer,
  updateCurrentServerIdentity,
  selectLocalServer,
  saveFavoriteServer,
  toggleFavorite,
  toggleQuickServerFavorite,
  clearServerHistory,
} = useWebClientServerHistory({ serverHost, serverPort, nickname, channel, rememberIdentity, identityMaterial, t, showToast });
const {
  accessMode,
  initialized,
  siteName,
  visitorNumber,
  visitorTotal,
  appVersion,
  accelerationRelays,
  openTargetPrefillBlocked,
  serverConfigLoading,
  serverConfigUnavailable,
  localizedWelcomeText,
  customWelcomeText,
  loadPublicConfig,
  restoreServerTarget,
} = useWebClientPublicConfig({ serverHost, serverPort, accelerationRelayId, language, t });
const fixedServerName = computed(() => {
  if (siteName.value === PRODUCT_NAME || siteName.value === "WebSpeak") return "VanillaClub";
  return safeSkinServerDisplayName(siteName.value, currentServerTarget()) || "TeamSpeak";
});
const clubLobby = computed(() => accessMode.value === "fixed" && fixedServerName.value === "VanillaClub");
const homeWelcomeText = computed(() => clubLobby.value ? customWelcomeText.value || t("clubDescription") : localizedWelcomeText.value);
const extensionPreferences = ref<InstanceType<typeof ExtensionPreferences> | null>(null);
function openExtensionPreferences(trigger: HTMLElement | null) {
  extensionPreferences.value?.open(trigger);
}
const publicSkin = usePublicSkin({ activeSkin, appVersion: () => appVersion.value });
const { activeSkinId, skinReady, skinLoadError, installedSkins, catalogSkins,
  select: onSkinChange, initialize: initializeSkin, switchToBuiltIn, switchToBuiltInAfterLoadError } = publicSkin;
const headerSkinId = computed(() => hostTheme.value === "dark" ? BUILTIN_DARK_SKIN : BUILTIN_LIGHT_SKIN);
const skinOptions = computed<SkinOption[]>(() => [
  { value: BUILTIN_LIGHT_SKIN, label: appearanceCopy(language.value).day, icon: "sun" },
  { value: BUILTIN_DARK_SKIN, label: appearanceCopy(language.value).night, icon: "moon" },
]);
const extensionSkinOptions = computed<SkinOption[]>(() => [
  ...catalogSkins.value.filter(skin => !skin.builtIn).map((skin) => ({
    value: skin.id,
    label: skin.name,
    icon: "compass",
  })),
  ...installedSkins.value.filter((skin) => !catalogSkins.value.some((item) => item.id === skin.id)).map((skin) => ({ value: skin.id, label: skin.name, icon: "compass" })),
]);
const skinHomeCopy = computed<SkinHomeCopy>(() => resolveSkinHomeCopy(activeSkin.value, language.value));
const skinHomeFeatures = computed(() => {
  if (!activeSkin.value) return [
    { id: "quality", title: t("joinFromBrowser"), description: t("noClientInstall"), icon: "", tone: "" },
    { id: "secure", title: t("useExistingIdentity"), description: t("importIdentityBeforeJoining"), icon: "", tone: "" },
  ];
  const defaults = [
    { id: "quality", title: t("highQuality"), description: t("opusAudio"), icon: "waveform", tone: "" },
    { id: "secure", title: t("secureJoin"), description: t("inviteProtected"), icon: "shield", tone: "mint" },
    { id: "realtime", title: t("realtime"), description: t("membersSync"), icon: "users", tone: "sand" },
  ];
  const features = [...defaults];
  const custom = skinHomeCopy.value.features ?? [];
  const icons = ["waveform", "shield", "users"];
  const tones = ["", "mint", "sand"];
  custom.forEach((feature, index) => {
    const base = defaults[index];
    const replacement = {
      id: base?.id ?? `custom-${index}`,
      title: feature.title.trim() || base?.title || "",
      description: feature.description.trim() || base?.description || "",
      icon: base?.icon ?? icons[index % icons.length],
      tone: base?.tone ?? tones[index % tones.length],
    };
    if (base) features[index] = replacement;
    else if (replacement.title && replacement.description) features.push(replacement);
  });
  return features;
});
const audioControls = useWebClientAudioControls({
  settingsOpen,
  microphoneMuted,
  noiseSuppressionLevel,
  inputVolume,
  voxThreshold,
  notificationVolume,
  micLevel,
  microphoneTestActive,
  accompanimentActive,
  accompanimentErrorCode,
  whisperTargetIds,
  prepareInputDevices,
  setInputVolume,
  setNoiseSuppressionLevel,
  setOutputVolume,
  setVoxThreshold,
  setNotificationVolume,
  setInputDevice,
  setOutputDevice,
  setMicrophoneMuted,
  startMicrophoneTest,
  stopMicrophoneTest,
  startAccompaniment,
  stopAccompaniment,
  setWhisperActive,
  localizedMessage,
  showToast,
  t,
});
function enableScreenWakeLockForSession(): void {
  if (isMobileViewport.value) screenWakeLockController?.enable();
}
function reconnectMobile(): void {
  enableScreenWakeLockForSession();
  reconnectNow();
}
const { toggleMicrophone, stopWhisperTalk } = audioControls;
const audioDockState = { microphoneMuted, inputVolume, outputVolume, outputMuted, noiseSuppressionLevel, accompanimentActive };
const audioSettingsState = {
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  audioContextState,
  microphoneMuted,
  noiseSuppressionLevel,
  inputVolume,
  outputVolume,
  voxThreshold,
  notificationVolume,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
};


function initialServerTarget() {
  const explicit = query.get("server") ?? query.get("target");
  if (explicit?.trim()) return splitTeamSpeakTarget(explicit);
  const host = (query.get("tsHost") ?? location.hostname).trim();
  const port = (query.get("tsPort") ?? DEFAULT_TEAM_SPEAK_PORT).trim();
  const target = splitTeamSpeakTarget(host, port || DEFAULT_TEAM_SPEAK_PORT);
  if (query.has("tsPort")) target.port = port;
  return target;
}

function persistLanguage() {
  localStorage.setItem("webspeak:language", language.value);
  void saveLocalPreferences({ schemaVersion: 1, language: language.value });
}

const screenShareControls = useWebClientScreenShare({
  streams: screenShareStreams,
  viewing: screenShareViewing,
  viewingStreamId: screenShareViewingStreamId,
  remoteStream: screenShareRemoteStream,
  remoteVolume: screenShareRemoteVolume,
  error: screenShareError,
  errorCode: screenShareErrorCode,
  startScreenShare,
  joinScreenShare,
  leaveScreenShare,
  nickname,
  avatarStyle,
  memberAvatar: memberAvatarById,
  t,
});
const { settingsOpen: screenShareSettingsOpen, errorText: screenShareErrorText } = screenShareControls;
const defaultDesktopWorkspace = computed(() => !isMobileViewport.value && OFFICIAL_SKIN_IDS.has(activeSkinId.value));
const memberSharingState = { screenShareActive, screenShareStarting, screenShareViewingStreamId, settingsOpen: screenShareSettingsOpen };
const {
  channelTree,
  currentChannel,
  currentChannelName,
  currentChannelDescription,
  currentMembers,
  memberChannels,
  filteredMemberChannels,
  whisperTargets,
} = useWebClientChannels({
  channels,
  members,
  clientId: computed(() => voiceState.tsClientId),
  selectedChannelId,
  channelName: channel,
  memberQuery,
  whisperTargetIds,
  t,
});
const memberControls = useWebClientMembers({
  channels: memberChannels,
  currentChannel,
  members,
  speakingIds,
  whisperTargetIds,
  moveClient,
  setWhisperTargets,
  sendPoke,
  setAway,
  onManualStatusChange: () => mobileAwayController?.preserveManualStatus(),
  stopWhisperTalk,
  localizedMessage,
  showToast,
  t,
});
const { away, memberMenu, clearWhisperTargets, isSpeaking, openMemberMenu, openMemberActions, setAutomaticAway } = memberControls;
const chat = useWebClientChat({
  messages: chatMessages,
  members,
  currentChannel,
  currentChannelName,
  selectedChannelId,
  clientId: computed(() => voiceState.tsClientId),
  connected: computed(() => voiceState.connected),
  sessionEpoch,
  serverKey: computed(() => combineTeamSpeakTarget(serverHost.value, serverPort.value)),
  isMobileViewport,
  mobileSection,
  closeMemberMenu: () => { memberMenu.value = null; },
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
  notifyPrivateMessage: () => playNotification("private"),
  t,
});
watch(() => mobileViewport.height, () => chat.scrollIfFollowing(), { flush: "post" });
const { tab: chatTab } = chat;
function openPrivateChat(targetClientId: number) {
  chat.openPrivateChat(targetClientId);
  void nextTick(() => document.querySelector<HTMLInputElement>(".workspace-chat .message-composer input")?.focus());
}
const {
  canJoin,
  currentServerTarget,
  doConnect,
  doDisconnect,
  submitServerPassword,
  cancelServerPassword,
  selectChannel,
  submitChannelPassword,
  cancelChannelPassword,
  selectChannelById,
} = useWebClientConnection({
  initialized: computed(() => initialized.value && !clearingLocalData.value),
  accessMode,
  isConnecting: computed(() => voiceState.connecting),
  isConnected: computed(() => voiceState.connected),
  errorCode: computed(() => voiceState.errorCode),
  errorMessage: computed(() => localizedMessage(voiceState.error)),
  channelSwitchedChannelId: computed(() => voiceState.channelSwitchedChannelId),
  nickname,
  channelName: channel,
  serverHost,
  serverPort,
  serverPassword,
  rememberIdentity,
  identityMaterial,
  accelerationRelayId,
  inviteToken,
  selectedChannelId,
  channels: channelTree,
  clientId: computed(() => voiceState.tsClientId),
  channelPasswordDialog,
  serverPasswordDialog,
  chatTab,
  beforeConnect: enableScreenWakeLockForSession,
  connect,
  disconnect,
  switchChannel,
  clearError,
  saveNickname: (value) => {
    localStorage.setItem("webspeak:nickname", value);
    void saveLocalPreferences({ schemaVersion: 1, lastNickname: value });
  },
  showToast,
  t,
});

const voiceWorkspace = useVoiceWorkspace({
  enabled: computed(() => activeSkin.value?.workspace?.apiVersion === 1 && activeSkin.value.workspace.mode === "persistent"),
  connected: computed(() => voiceState.connected),
});
const voiceConnectionBusy = computed(() => voiceState.connecting || voiceState.reconnecting || favoriteSwitchPending.value);
const voiceConnectionError = computed(() => voiceState.error ? localizedMessage(voiceState.error) : favoriteSwitchError.value);
const canRequestVoiceConnection = computed(() => canJoin.value && !serverConfigLoading.value && identityReady.value
  && !voiceState.connected && !voiceConnectionBusy.value);
function requestVoiceConnection(): void {
  if (!canRequestVoiceConnection.value || favoriteServerDialogOpen.value || serverPasswordDialog.open) return;
  beginFavoriteConnection();
}
const showVoiceShell = computed(() => Boolean(
  voiceWorkspace.active.value ||
  voiceState.connected || voiceState.reconnecting || voiceState.reconnectFailed
  || favoriteSwitchPending.value || favoriteSwitchFailed.value,
));
const favoriteSwitchLabel = computed(() => quickServers.value.find((server) =>
  isQuickServerTarget(server),
)?.label ?? currentServerTarget());

function isQuickServerTarget(server: QuickServer): boolean {
  return server.id === currentServerTarget().toLowerCase()
    || quickServerTargetsEqual(server.address, currentServerTarget());
}

function serverCanSwitch(_server: QuickServer): boolean {
  return accessMode.value === "open";
}

const quickServersForDisplay = computed(() => quickServers.value.map((server) => {
  const liveInfo = isQuickServerTarget(server) ? voiceServerInfo.value : null;
  const serverName = liveInfo?.name.trim() || server.serverName;
  const label = serverName && (!server.label.trim() || isQuickServerAddressLabel(server.label, server.address))
    ? serverName
    : server.label;
  return {
    ...server,
    label,
    ...(serverName ? { serverName } : {}),
    serverIcon: liveInfo ? (liveInfo.icon || undefined) : server.serverIcon,
  };
}));

function connectQuickServer(server: QuickServer): void {
  if (serverConfigLoading.value || !identityReady.value) return;
  if ((voiceState.connecting || voiceState.connected) && isQuickServerTarget(server)) return;
  if (accessMode.value !== "open") {
    showToast(t("serverSwitchRestricted"));
    return;
  }
  // A slow TeamSpeak handshake can leave the previous attempt pending for a
  // long time. Stop its ticket request/socket before starting the new target.
  if (voiceState.connecting) doDisconnect(false);
  const target = splitTeamSpeakTarget(server.address);
  serverHost.value = target.address;
  serverPort.value = target.port || DEFAULT_TEAM_SPEAK_PORT;
  nickname.value = server.nickname?.trim() || nickname.value.trim();
  channel.value = server.lastChannelHint?.name ?? "";
  serverPassword.value = "";
  accelerationRelayId.value = "";
  inviteToken.value = "";
  selectedChannelId.value = "";
  serverPasswordDialog.open = false;
  serverPasswordDialog.password = "";
  serverPasswordDialog.errorCode = "";
  favoriteServerDialogOpen.value = false;
  beginFavoriteConnection();
}

function beginFavoriteConnection(): void {
  favoriteSwitchPending.value = true;
  favoriteSwitchFailed.value = false;
  favoriteSwitchError.value = "";
  if (!canJoin.value) {
    failFavoriteConnection(t("quickConnectFailed"));
    return;
  }
  doConnect();
}

function failFavoriteConnection(message: string): void {
  favoriteSwitchPending.value = false;
  favoriteSwitchFailed.value = true;
  favoriteSwitchError.value = message;
}

function cancelFavoriteServerPassword(): void {
  cancelServerPassword();
  if (favoriteSwitchPending.value) failFavoriteConnection(t("quickConnectFailed"));
}

function leaveVoiceWorkspace(): void {
  favoriteSwitchPending.value = false;
  favoriteSwitchFailed.value = false;
  favoriteSwitchError.value = "";
  doDisconnect();
}

function toggleQuickFavorite(server: QuickServer): void {
  void toggleQuickServerFavorite(server);
}

function openFavoriteServerDialog(): void {
  if (accessMode.value !== "open") {
    showToast(t("serverFeatureAdminDisabled"));
    return;
  }
  if (!showVoiceShell.value || serverConfigLoading.value || !identityReady.value || voiceState.connecting || favoriteDialogBusy.value) return;
  favoriteServerDialogOpen.value = true;
}

async function submitFavoriteServerDraft(draft: FavoriteServerDraft): Promise<void> {
  if (favoriteDialogBusy.value || serverConfigLoading.value || !identityReady.value || voiceState.connecting || accessMode.value !== "open") return;
  const port = draft.port || DEFAULT_TEAM_SPEAK_PORT;
  if (!draft.address || !draft.nickname || !isValidTeamSpeakPort(port)) {
    showToast(t("quickConnectFailed"));
    return;
  }

  const parsed = splitTeamSpeakTarget(draft.address, port);
  serverHost.value = parsed.address;
  serverPort.value = parsed.port || DEFAULT_TEAM_SPEAK_PORT;
  nickname.value = draft.nickname;
  channel.value = draft.channel;
  serverPassword.value = "";
  accelerationRelayId.value = "";
  inviteToken.value = "";
  selectedChannelId.value = "";
  serverPasswordDialog.open = false;
  serverPasswordDialog.password = "";
  serverPasswordDialog.errorCode = "";

  favoriteDialogBusy.value = true;
  try {
    const target = currentServerTarget();
    if (!await saveFavoriteServer(target, draft.label || target, nickname.value, channel.value)) return;
    favoriteServerDialogOpen.value = false;
    beginFavoriteConnection();
  } finally {
    favoriteDialogBusy.value = false;
  }
}

const visiblePokes = computed(() => pokeNotifications.slice(-3));

const skinPluginQuickServers = createSkinPluginQuickServerProjection();
const skinPluginQuickList = computed(() => skinPluginQuickServers.project(
  quickServersForDisplay.value,
  isQuickServerTarget,
  accessMode.value !== "open",
  t("serverSwitchRestricted"),
));
const currentServerDisplayName = computed(() => {
  // The skin/plugin projection deliberately hides names that look like an
  // address. The host's own server header should still show TeamSpeak's
  // configured public server name instead of a synthetic "Recent N" label.
  const liveName = cleanServerDisplayName(voiceServerInfo.value?.name);
  if (liveName) return liveName;
  const savedCurrent = quickServers.value.find(isQuickServerTarget);
  const savedName = cleanServerDisplayName(savedCurrent?.serverName);
  const savedLabel = savedCurrent?.label.trim() ?? "";
  return savedName || (savedCurrent && savedLabel && !isQuickServerAddressLabel(savedLabel, savedCurrent.address) ? savedLabel : "TeamSpeak");
});
const currentServerPluginLabel = computed(() => {
  const target = currentServerTarget();
  const liveName = safeSkinServerDisplayName(voiceServerInfo.value?.name ?? "", target);
  if (liveName) return liveName;
  const savedCurrent = quickServers.value.find(isQuickServerTarget);
  const savedName = savedCurrent ? safeSkinServerDisplayName(savedCurrent.serverName ?? "", savedCurrent.address) : "";
  return savedName || skinPluginQuickList.value.find((server) => server.current)?.label || "TeamSpeak";
});

function cleanServerDisplayName(value: string | undefined): string {
  return value?.trim().replace(/\u0000/g, "").slice(0, 160) ?? "";
}
const skinPluginFavorites = computed(() => skinPluginQuickList.value
  .filter((server) => server.favorite)
  .map(({ favorite: _favorite, ...server }) => server));
const skinPluginMembers = computed(() => memberChannels.value.flatMap((item) => item.members.map((member) => {
  const screenShare = screenShareControls.streamForMember(member);
  return {
    id: String(member.id),
    name: member.nickname,
    avatarInitial: Array.from(member.nickname.trim())[0] ?? "?",
    channelId: item.id,
    status: member.away ? "away" : member.inputMuted ? "muted" : speakingIds.has(member.id) ? "speaking" : "online",
    speaking: speakingIds.has(member.id),
    self: member.id === voiceState.tsClientId,
    screenSharing: Boolean(screenShare),
    ...(screenShare ? { screenShareStreamId: screenShare.streamId } : {}),
  };
})));

const skinPluginContext = computed(() => ({
  skin: {
    locale: language.value,
    messages: skinMessageOverrides.value,
  },
  session: {
    status: {
      connected: voiceState.connected,
      connecting: voiceState.connecting,
      connectionState: voiceState.connected ? "connected" : voiceState.connecting || voiceState.reconnecting ? "connecting" : "disconnected",
      channelId: currentChannel.value?.id ?? "",
      channelName: currentChannelName.value,
      userName: nickname.value,
      serverLabel: currentServerPluginLabel.value,
    },
    channels: channelTree.value.map((item) => {
      const members = skinPluginMembers.value.filter((member) => member.channelId === item.id);
      const spacer = getChannelSpacer(item);
      return {
        id: item.id,
        name: item.name,
        displayName: channelDisplayName(item),
        isSpacer: Boolean(spacer),
        spacerAlignment: spacer?.alignment ?? "",
        spacerStyle: spacer?.style ?? "",
        parentId: item.parentID,
        depth: item.depth,
        memberCount: item.members.length,
        memberCountLabel: String(item.members.length).padStart(2, "0"),
        ...(typeof item.maxClients === "number" && typeof item.maxClientsLimited === "boolean"
          ? { maxClients: item.maxClients, maxClientsLimited: item.maxClientsLimited }
          : {}),
        current: item.id === currentChannel.value?.id,
        members,
      };
    }),
    members: skinPluginMembers.value,
  },
  favorites: { items: skinPluginFavorites.value },
  servers: { quickList: skinPluginQuickList.value },
  chat: {
    status: {
      panelOpen: chat.panelOpen.value,
      tab: chat.tab.value,
      tabLabel: chat.tabLabel.value,
    },
    messages: chat.visibleMessages.value.filter((message) => message.scope === "channel").map((message) => ({
      id: message.id,
      author: message.invokerName,
      text: message.message,
      time: new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      kind: message.isSelf ? "self" : "message",
      channelId: message.targetId ?? currentChannel.value?.id ?? "",
    })),
  },
  audio: {
    status: {
      microphoneMuted: microphoneMuted.value,
      outputMuted: outputMuted.value,
      noiseSuppressionEnabled: noiseSuppressionEnabled.value,
      accompanimentActive: accompanimentActive.value,
    },
  },
  whisper: {
    status: {
      active: whisperActive.value,
      targetCount: whisperTargetIds.size,
    },
  },
  screenShare: {
    status: {
      active: screenShareActive.value,
      starting: screenShareStarting.value,
      viewing: screenShareViewing.value,
    },
    streams: screenShareStreams.map((stream) => ({
      streamId: stream.streamId,
      source: stream.source,
      ownerClientId: stream.ownerClientId ?? 0,
      ownerNickname: stream.ownerNickname,
      name: stream.name,
      audio: stream.audio,
      viewerCount: stream.viewerCount,
    })),
  },
}));

const readSkinRuntimeSessionStatus = (_signal: AbortSignal) => ({
  connected: voiceState.connected,
  channelName: voiceState.connected ? currentChannelName.value : null,
  memberCount: skinPluginMembers.value.length,
});

function switchQuickServerByOpaqueId(quickServerId: string): void {
  if (accessMode.value !== "open") {
    showToast(t("serverSwitchRestricted"));
    return;
  }
  const target = skinPluginQuickServers.resolve(quickServerId);
  if (target && quickServers.value.some((server) => server.id === target.id)) connectQuickServer(target);
}

const skinPluginActions = {
  "voice.joinChannel": (args: Record<string, string | number | boolean>) => {
    if (!voiceState.connected || typeof args.channelId !== "string") return;
    const target = channelTree.value.find((item) => item.id === args.channelId);
    if (target && target.id !== currentChannel.value?.id) selectChannel(target);
  },
  "favorites.switch": (args: Record<string, string | number | boolean>) => {
    if (accessMode.value !== "open" || typeof args.favoriteId !== "string") return;
    const target = skinPluginQuickServers.resolve(args.favoriteId);
    if (target?.isFavorite && quickServers.value.some((server) => server.id === target.id && server.isFavorite)) connectQuickServer(target);
  },
  "quickServers.switch": (args: Record<string, string | number | boolean>) => {
    if (typeof args.quickServerId !== "string") return;
    switchQuickServerByOpaqueId(args.quickServerId);
  },
  "chat.sendMessage": (args: Record<string, string | number | boolean>) => {
    if (!voiceState.connected || typeof args.text !== "string" || !currentChannel.value?.id) return;
    const text = args.text.trim();
    if (!text || text.length > 1000 || text.includes("\u0000")) return;
    void sendTextMessage(text, currentChannel.value.id);
  },
  "session.copyInviteLink": () => doShare(),
  "chat.togglePanel": () => chat.togglePanel(),
  "voice.toggleMicrophone": () => { if (voiceState.connected) toggleMicrophone(); },
  "voice.toggleOutputMute": () => { if (voiceState.connected) toggleOutputMute(); },
  "audio.openSettings": () => { settingsOpen.value = true; },
  "audio.toggleNoiseSuppression": () => { if (voiceState.connected) audioControls.toggleNoiseSuppression(); },
  "audio.toggleAccompaniment": () => { if (voiceState.connected) void audioControls.toggleAccompaniment(); },
  "voice.setOutputVolume": (args: Record<string, string | number | boolean>) => {
    if (!voiceState.connected) return;
    const volume = typeof args.volume === "number" ? args.volume
      : typeof args.volume === "string" && args.volume.trim() ? Number(args.volume) : Number.NaN;
    if (!Number.isFinite(volume)) return;
    setOutputVolume(Math.max(0, Math.min(1, volume)));
  },
  "voice.connect": () => requestVoiceConnection(),
  "voice.disconnect": () => { if (voiceState.connected || voiceState.connecting || favoriteSwitchPending.value) leaveVoiceWorkspace(); },
  "voice.setAway": (args: Record<string, string | number | boolean>) => {
    if (!voiceState.connected || typeof args.away !== "boolean") return;
    const message = typeof args.message === "string" ? args.message.slice(0, 200) : "";
    setAway(args.away, message);
  },
  "voice.setWhisperActive": (args: Record<string, string | number | boolean>) => {
    if (!voiceState.connected || typeof args.active !== "boolean") return;
    setWhisperActive(args.active);
  },
  "voice.startScreenShare": () => {
    if (voiceState.connected && !screenShareActive.value && !screenShareStarting.value) void startScreenShare();
  },
  "voice.stopScreenShare": () => { if (screenShareActive.value) stopScreenShare(); },
  "voice.joinScreenShare": (args: Record<string, string | number | boolean>) => {
    if (!voiceState.connected || typeof args.streamId !== "string") return;
    if (screenShareStreams.some((stream) => stream.streamId === args.streamId)) joinScreenShare(args.streamId);
  },
  "voice.leaveScreenShare": () => { if (screenShareViewing.value) leaveScreenShare(); },
};

const homeConnectionStatus = computed(() => {
  if (voiceState.connecting) return t("connecting");
  if (voiceState.error) return localizedMessage(voiceState.error);
  if (browserError.value) return localizedMessage(browserError.value);
  if (!serverConfigLoading.value && !initialized.value) return t("notConfigured");
  if (!localPersistenceAvailable) return t("localPersistenceUnavailable");
  return "";
});

const skinPluginWidgets = {
  "home.visitor-count": () => visitorNumber.value === null ? null : h(VisitorCount, {
    currentLabel: t("visitorCount", { count: visitorNumber.value }),
    totalLabel: visitorTotal.value === null ? undefined : t("visitorTotal", { count: visitorTotal.value }),
  }),
  "home.server-announcement": () => h("section", {
    "data-ws-part": "home.server-announcement",
    "aria-label": t("serverAnnouncement"),
  }, [
    h("h2", { "data-ws-part": "home.server-announcement.title" }, t("serverAnnouncement")),
    h("p", { "data-ws-part": "home.server-announcement.body" }, localizedWelcomeText.value),
  ]),
  // The legacy widget remains valid. The same management link is in the host header.
  "home.social-links": () => null,
  "voice.screen-share-start": () => h("button", {
    type: "button",
    class: "skin-runtime-screen-share-start",
    disabled: !voiceState.connected || screenShareActive.value || screenShareStarting.value,
    "aria-label": t("startScreenShare"),
    onClick: () => {
      if (voiceState.connected && !screenShareActive.value && !screenShareStarting.value) void startScreenShare();
    },
  }, [h(Icon, { name: "share", size: 16 }), h("span", null, t("startScreenShare"))]),
  "home.connection-form": () => h(JoinForm, {
    autofocusNickname: !isMobileViewport.value,
    serverHost: serverHost.value,
    "onUpdate:serverHost": (value: string) => { serverHost.value = value; },
    serverPort: serverPort.value,
    "onUpdate:serverPort": (value: string) => { serverPort.value = value; },
    serverPassword: serverPassword.value,
    "onUpdate:serverPassword": (value: string) => { serverPassword.value = value; },
    nickname: nickname.value,
    "onUpdate:nickname": (value: string) => { nickname.value = value; },
    channel: channel.value,
    "onUpdate:channel": (value: string) => { channel.value = value; },
    rememberIdentity: rememberIdentity.value,
    "onUpdate:rememberIdentity": (value: boolean) => { rememberIdentity.value = value; },
    accelerationRelayId: accelerationRelayId.value,
    "onUpdate:accelerationRelayId": (value: string) => { accelerationRelayId.value = value; },
    accessMode: accessMode.value,
    openTargetPrefillBlocked: openTargetPrefillBlocked.value,
    accelerationRelays: accelerationRelays.value,
    quickServers: quickServersForDisplay.value,
    isFavorite: isFavorite.value,
    identityExportBusy: identityExportBusy.value,
    hasIdentity: Boolean(identityMaterial.value),
    connecting: voiceState.connecting,
    joinDisabled: !canJoin.value || serverConfigLoading.value || !identityReady.value || voiceState.connecting,
    t,
    onConnect: doConnect,
    onDisconnect: doDisconnect,
    onSelectServer: selectLocalServer,
    onToggleFavorite: toggleFavorite,
    onToggleQuickFavorite: toggleQuickFavorite,
    onImportIdentity: openIdentityImport,
    onExportIdentity: exportIdentity,
  }),
  "home.connection-status": () => h("p", {
    "data-ws-part": "home.connection-status",
    role: "status",
    "aria-live": "polite",
  }, homeConnectionStatus.value),
  "home.identity-provider": (options?: SkinPluginWidgetOptions) => {
    const providerId = options?.identityProviderId ?? "external";
    const providerLabel = options?.identityProviderLabel ?? providerId;
    return h("button", {
      type: "button",
      class: "ws-home-identity-provider-button",
      "data-ws-part": "home.identity-provider.button",
      "aria-label": t("identityProviderLogin", { provider: providerLabel }),
      onClick: () => requestIdentityProviderLogin(providerId, providerLabel),
    }, [h("span", { class: "ws-home-identity-provider-label", "data-ws-part": "home.identity-provider.label", "aria-hidden": "true" }, providerLabel)]);
  },
  "app.skin-switcher": () => h(SkinSwitcher, {
    modelValue: headerSkinId.value,
    class: "skin-switcher",
    menuLabel: t("skinSelector"),
    options: skinOptions.value,
    onChange: onSkinChange,
  }),
  "app.language-switcher": () => h(LanguageSwitcher, {
    skinIcon: true,
    modelValue: language.value,
    "onUpdate:modelValue": (value: Language) => { language.value = value; },
    menuLabel: t("languageMenu"),
    onChange: persistLanguage,
  }),
  "voice.plugin-launcher": (options?: SkinPluginWidgetOptions) => h("div", {
    ref: (element) => {
      if (element instanceof HTMLElement) {
        const presentation = options?.pluginPresentation ?? "dialog";
        if (skinPluginToolbar.value?.element !== element || skinPluginToolbar.value.presentation !== presentation) {
          skinPluginToolbar.value = { element, presentation };
        }
      } else if (skinPluginToolbar.value && !skinPluginToolbar.value.element.isConnected) {
        skinPluginToolbar.value = null;
      } else if (skinPluginToolbar.value) {
        const previous = skinPluginToolbar.value.element;
        void nextTick(() => {
          if (skinPluginToolbar.value?.element === previous && !previous.isConnected) skinPluginToolbar.value = null;
        });
      }
    },
    class: "webspeak-plugin-toolbar-skin-slot",
  }),
  "voice.channel-panel": () => h(ChannelMemberPanel, {
    query: memberQuery.value,
    "onUpdate:query": (value: string) => { memberQuery.value = value; },
    model: memberControls,
    filteredMemberChannels: filteredMemberChannels.value,
    currentChannelId: currentChannel.value?.id,
    mobileVisible: true,
    isMobileViewport: isMobileViewport.value,
    volumes,
    avatarStyle,
    avatarInitial,
    rangeStyle,
    t,
    onSelectChannel: selectChannel,
    onVolumeInput: onVolInput,
  }),
  "voice.server-switcher": () => h(VoiceServerSwitcher, {
    servers: skinPluginQuickList.value,
    onSwitchServer: switchQuickServerByOpaqueId,
  }),
  "voice.server-header": () => h(VoiceServerHeader, {
    serverLabel: currentServerDisplayName.value,
    connectionState: voiceState.connected ? "connected" : voiceState.connecting || voiceState.reconnecting ? "connecting" : "disconnected",
    servers: skinPluginQuickList.value,
    onSwitchServer: switchQuickServerByOpaqueId,
    "onUpdate:query": (value: string) => { channelTreeSearchQuery.value = value; },
  }),
  "voice.server-banner": () => h(VoiceServerBanner, {
    bannerUrl: voiceServerInfo.value?.bannerUrl ?? null,
    welcomeMessage: voiceServerInfo.value?.welcomeMessage ?? "",
    t,
  }),
  "voice.channel-tree": (options?: SkinPluginWidgetOptions) => h(VoiceChannelTree, {
    channels: channelTree.value,
    currentChannelId: currentChannel.value?.id,
    query: channelTreeSearchQuery.value,
    layout: options?.layout === "server-sidebar" ? "server-sidebar" : "default",
    avatarStyle,
    avatarInitial,
    isSpeaking,
    isScreenSharing: (member: ChannelMember) => Boolean(screenShareControls.streamForMember(member)),
    showMemberActions: options?.memberActions === true,
    memberDragDrop: options?.memberDragDrop === true,
    draggedMemberId: memberControls.draggedMember.value?.id ?? null,
    dragOverChannelId: memberControls.dragOverChannelId.value,
    t,
    onJoin: selectChannel,
    onMemberContextMenu: ({ member, event }: { member: ChannelMember; event: MouseEvent }) => openMemberMenu(member, event),
    onMemberDragStart: ({ member, event }: { member: ChannelMember; event: DragEvent }) => memberControls.onMemberDragStart(member, event),
    onMemberDragEnd: () => memberControls.onMemberDragEnd(),
    onChannelDragOver: ({ channel, event }: { channel: TreeChannel; event: DragEvent }) => memberControls.onChannelDragOver(channel, event),
    onChannelDragLeave: ({ channel, event }: { channel: TreeChannel; event: DragEvent }) => memberControls.onChannelDragLeave(channel, event),
    onChannelDrop: ({ channel, event }: { channel: TreeChannel; event: DragEvent }) => memberControls.onChannelDrop(channel, event),
  }),
  "voice.member-cards": (options?: SkinPluginWidgetOptions) => h(VoiceMemberCards, {
    currentMembers: currentMembers.value,
    isMobileViewport: isMobileViewport.value,
    showMemberActions: options?.memberActions === true,
    showScreenShare: options?.screenShare !== false,
    sharing: options?.screenShare === false ? undefined : memberSharingState,
    controls: options?.screenShare === false ? undefined : screenShareControls,
    isSpeaking,
    avatarStyle,
    avatarInitial,
    t,
    onMemberActions: openMemberActions,
    onStopShare: stopScreenShare,
  }),
  "voice.chat-panel": () => h(ChatPanel, {
    model: chat,
    t,
    currentChannelName: currentChannelName.value,
    mobileHidden: false,
    serverEvents,
    avatarStyle,
    avatarInitial,
    messageAvatar,
    formatTime,
  }),
  "voice.audio-controls": () => isMobileViewport.value
    ? h("div", { class: "mobile-voice-controls", role: "toolbar", "aria-label": t("desktopAudioControls") }, [
      h("button", {
        type: "button",
        class: ["mobile-voice-toggle", "mobile-microphone-toggle", microphoneMuted.value && "muted"],
        "aria-label": t("microphone"),
        "aria-pressed": !microphoneMuted.value,
        onClick: toggleMicrophone,
      }, [h(Icon, { name: microphoneMuted.value ? "mic-off" : "mic", size: 20 }), h("span", null, t("microphone"))]),
      h("button", {
        type: "button",
        class: ["mobile-voice-toggle", "mobile-output-toggle", outputMuted.value && "muted"],
        "aria-label": t("speaker"),
        "aria-pressed": !outputMuted.value,
        onClick: toggleOutputMute,
      }, [h(Icon, { name: outputMuted.value ? "volume-off" : "volume", size: 20 }), h("span", null, t("speaker"))]),
    ])
    : h(AudioDock, {
      model: audioDockState,
      controls: audioControls,
      t,
      rangeStyle,
      onSettings: () => { settingsOpen.value = true; },
      onOutputMute: toggleOutputMute,
    }),
  "voice.screen-share-player": () => screenShareViewing.value ? h(ScreenSharePlayer, {
    model: screenShareControls,
    screenShareRemoteStream: screenShareRemoteStream.value,
    screenShareRemoteVolume: screenShareRemoteVolume.value,
    screenShareError: screenShareError.value,
    leaveScreenShare,
    avatarInitial,
    t,
  }) : null,
  "voice.whisper-controls": () => whisperTargetIds.size ? h(WhisperControls, {
    targets: whisperTargets.value,
    active: whisperActive.value,
    enabled: !isMobileViewport.value || mobileSection.value === "voice",
    controls: audioControls,
    t,
    onClear: clearWhisperTargets,
  }) : null,
  "voice.performance-panel": (options?: SkinPluginWidgetOptions) => h(VoicePerformancePanel, {
    model: performance,
    screenShareWebRtcStats,
    showScreenShare: options?.screenShare !== false,
    t,
  }),
  "voice.connection-status": () => favoriteServerDialogOpen.value || serverPasswordDialog.open ? null : h(VoiceConnectionStatus, {
    connected: voiceState.connected,
    connecting: voiceConnectionBusy.value,
    nickname: nickname.value,
    "onUpdate:nickname": (value: string) => { if (!voiceConnectionBusy.value) nickname.value = value; },
    error: voiceConnectionError.value,
    canConnect: canRequestVoiceConnection.value,
    t,
    onConnect: requestVoiceConnection,
  }),
  "voice.connection-controls": () => h("div", { class: "ws-plugin-connection-controls", role: "toolbar", "aria-label": t("desktopAudioControls") }, [
    h("button", { type: "button", "aria-label": t("copyInvite"), title: t("copyInvite"), onClick: doShare }, [h(Icon, { name: "share", size: 18 })]),
    ...(accessMode.value === "open" ? [h("button", {
      type: "button",
      "aria-label": t(isFavorite.value ? "removeFavorite" : "saveFavorite"),
      "aria-pressed": isFavorite.value,
      title: t(isFavorite.value ? "removeFavorite" : "saveFavorite"),
      onClick: toggleFavorite,
    }, [h(Icon, { name: "star", size: 18 })])] : []),
    h("button", { type: "button", "aria-label": t("exit"), title: t("exit"), onClick: leaveVoiceWorkspace }, [h(Icon, { name: "door", size: 18 }), h("span", null, t("exit"))]),
  ]),
  "voice.disconnect-control": () => h("button", {
    type: "button",
    class: "ws-plugin-disconnect-control",
    "aria-label": t("exit"),
    onClick: leaveVoiceWorkspace,
  }, [h(Icon, { name: "power", size: 18 }), h("span", null, t("exit"))]),
};

async function requestIdentityProviderLogin(providerId: string, providerLabel: string): Promise<void> {
  try {
    const handled = await dispatchIdentityProviderLogin({ providerId, providerLabel });
    if (!handled) showToast(t("identityProviderInDevelopment", { provider: providerLabel }));
  } catch {
    showToast(t("identityProviderLoginFailed", { provider: providerLabel }));
  }
}

watch(() => pokeNotifications.length, (length, previousLength) => {
  const latest = pokeNotifications[length - 1];
  if (!latest || length <= previousLength) return;
  showToast(`${latest.invokerName} ${t("pokedYou")}${latest.message ? `：${latest.message}` : ""}`);
  playNotification("poke");
  if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("poke"), { body: `${latest.invokerName}: ${latest.message || t("pokedYou")}` });
});
watch(language, (locale) => {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
}, { immediate: true });
watch(rememberIdentity, (remember) => {
  if (clearingLocalData.value) return;
  localStorage.setItem("webspeak:remember-identity", remember ? "1" : "0");
  if (!remember) {
    identityMaterial.value = "";
    void removeStoredIdentity();
  }
});
watch([rememberIdentity, identityMaterial], ([remember, material]) => {
  if (clearingLocalData.value) return;
  if (remember && material) void saveStoredIdentity(material);
  if (!remember && material) identityMaterial.value = "";
});
watch(() => voiceState.connected, (connected) => {
  if (!connected) return;
  favoriteSwitchPending.value = false;
  favoriteSwitchFailed.value = false;
  favoriteSwitchError.value = "";
  playNotification("connected");
  recordCurrentServer();
});
watch(voiceServerInfo, (server) => {
  if (server && voiceState.connected && server.name.trim()) {
    void updateCurrentServerIdentity(server.name, server.icon ?? null);
  }
});
watch(() => voiceState.errorCode, (code) => {
  if (!favoriteSwitchPending.value || !code || code === "SERVER_PASSWORD_REQUIRED" || code === "INVALID_SERVER_PASSWORD") return;
  failFavoriteConnection(localizedMessage(voiceState.error) || t("quickConnectFailed"));
});
watch(() => showVoiceShell.value, (roomVisible) => {
  if (roomVisible) resetIdentityOperations();
}, { flush: "sync" });

watch(() => voiceState.reconnecting, (reconnecting, wasReconnecting) => {
  if (reconnecting && !wasReconnecting) {
    playNotification("disconnected");
  }
});
watch(() => voiceState.reconnectFailed, (failed, wasFailed) => {
  if (failed && !wasFailed) playNotification("reconnectFailed");
});
watch(shouldKeepScreenAwake, (keepAwake) => {
  if (!screenWakeLockController) return;
  if (keepAwake) screenWakeLockController.enable();
  else screenWakeLockController.disable();
});
watch([() => voiceState.connected, isMobileViewport], () => mobileAwayController?.sync());
watch(screenWakeLockState, (state, previous) => {
  if (!state.unavailable || previous.unavailable || !shouldKeepScreenAwake.value) return;
  showToast(t(state.supported ? "screenWakeLockUnavailable" : "screenWakeLockUnsupported"));
});

let deviceChangeHandler: (() => void) | undefined;
let viewportMediaQuery: MediaQueryList | undefined;
let viewportChangeHandler: (() => void) | undefined;

onMounted(() => {
  mobileAwayController = createMobileAwayController(document, window, {
    isMobileClient: () => isMobileViewport.value,
    isConnected: () => voiceState.connected,
    isAway: () => away.value,
    setAway: setAutomaticAway,
  });
  mobileAwayController.sync();
  screenWakeLockController = createScreenWakeLockController(getScreenWakeLockApi(), document, state => { screenWakeLockState.value = state; });
  if (shouldKeepScreenAwake.value) screenWakeLockController.enable();
  stopViewportObservation = observeMobileViewport(window, value => Object.assign(mobileViewport, value));
  // The selected skin is applied to this public root, never to the admin DOM.
  applyTheme(getStoredTheme());
  browserError.value = checkSupport() ?? "";
  void voiceWorkspace.restore(async () => {
    const [, , , preferences] = await Promise.all([loadPublicConfig(), initializeSkin(), loadSavedServers(), loadLocalPreferences()]);
    return { preferences, recent: [...recentServers.value] };
  }, (snapshot) => {
    const { preferences, recent } = snapshot;
    if (!localStorage.getItem("webspeak:language") && (preferences.language === "zh" || preferences.language === "en" || preferences.language === "de" || preferences.language === "ru" || preferences.language === "ja")) language.value = preferences.language;
    if (!nickname.value.trim()) nickname.value = preferences.lastNickname || recent[0]?.nickname || "";
    const hasInvite = ["invite", "server", "target", "tsHost", "tsPort", "channel"].some(key => query.has(key));
    if (voiceWorkspace.active.value && !hasInvite && accessMode.value === "open"
      && !voiceState.connected && !voiceState.connecting && !favoriteSwitchPending.value
      && !favoriteServerDialogOpen.value && !serverPasswordDialog.open) {
      const latest = recent[0];
      if (latest) selectLocalServer(latest.address, latest.nickname, latest.lastChannelHint?.name);
    }
  });
  void restoreIdentity(async () => {
    const stored = await loadStoredIdentity();
    return stored && localStorage.getItem("webspeak:remember-identity") === "1" ? stored.privateMaterial : null;
  }).finally(() => {
    identityReady.value = true;
  });
  deviceChangeHandler = () => { void refreshAudioDevices().catch(() => undefined); };
  navigator.mediaDevices?.addEventListener("devicechange", deviceChangeHandler);
  viewportMediaQuery = window.matchMedia("(max-width: 740px)");
  viewportChangeHandler = () => {
    isMobileViewport.value = viewportMediaQuery?.matches ?? false;
    if (!isMobileViewport.value) memberMenu.value = null;
    else if (accompanimentActive.value) void stopAccompaniment();
  };
  viewportChangeHandler();
  viewportMediaQuery.addEventListener?.("change", viewportChangeHandler);
});
onUnmounted(() => {
  mobileAwayController?.dispose();
  screenWakeLockController?.dispose();
  stopViewportObservation?.();
  if (deviceChangeHandler) navigator.mediaDevices?.removeEventListener("devicechange", deviceChangeHandler);
  if (viewportMediaQuery && viewportChangeHandler) viewportMediaQuery.removeEventListener?.("change", viewportChangeHandler);
  if (toastTimer) clearTimeout(toastTimer);
});


function selectMobileSection(section: typeof mobileSection.value): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  memberMenu.value = null;
  mobileSection.value = section;
}

function channelLabel(item: TreeChannel) {
  return `${"　".repeat(item.depth)}${item.name}`;
}

const inviteDialogOpen = ref(false);
watch(() => voiceState.connected, connected => { if (!connected) inviteDialogOpen.value = false; });
function doShare() {
  if (voiceState.connected) inviteDialogOpen.value = true;
}

async function clearBrowserData(): Promise<void> {
  if (clearingLocalData.value || !window.confirm(t("clearLocalDataConfirm"))) return;
  clearingLocalData.value = true;
  try {
    doDisconnect(false);
    cancelServerPassword();
    cancelChannelPassword();
    resetIdentityOperations();
    voiceWorkspace.reset();
    publicSkin.cancel();
    clearServerHistory();

    nickname.value = "";
    channel.value = initialChannel;
    inviteToken.value = initialInviteToken;
    restoreServerTarget();
    serverPassword.value = "";
    accelerationRelayId.value = "";
    identityMaterial.value = "";
    rememberIdentity.value = false;
    for (const key of ["webspeak:nickname", "webspeak:language", "webspeak:theme", "webspeak:active-skin", "webspeak:skin-choice", "webspeak:input-device", "webspeak:output-device", "webspeak:remember-identity"]) localStorage.removeItem(key);
    language.value = getInitialLanguage();

    await clearStoredLocalData();
    await publicSkin.reset();
    showToast(t("localDataCleared"));
  } finally {
    clearingLocalData.value = false;
  }
}

function dismissPoke(id: string): void {
  const index = pokeNotifications.findIndex((poke) => poke.id === id);
  if (index >= 0) pokeNotifications.splice(index, 1);
}

function showToast(message: string) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ""; }, 2800);
}

function avatarInitial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

const avatarColors = ["#E9BEAA", "#C7D1B9", "#E8C6A8", "#CCC4DD", "#EDD2D4", "#C8D9E9", "#E4D3B8"];
function avatarStyle(name: string, isSelf = false, avatar = "") {
  const fallback = isSelf ? "var(--accent)" : "";
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return {
    background: fallback || avatarColors[Math.abs(hash) % avatarColors.length],
    "--avatar-ink": isSelf ? "var(--on-action)" : "#292620",
    ...(avatar ? { backgroundImage: `url("${avatar}")`, backgroundPosition: "center", backgroundSize: "cover" } : {}),
  };
}

function memberAvatarById(clientId: number): string {
  return members.find((candidate) => candidate.id === clientId)?.avatar ?? "";
}

function messageAvatar(message: ChatMessage): string {
  const member = members.find((candidate) =>
    (typeof message.senderId === "number" && candidate.id === message.senderId) ||
    (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

function formatTime(timestamp: number) {
  const locale = language.value === "zh" ? "zh-CN" : language.value === "de" ? "de-DE" : language.value === "ru" ? "ru-RU" : language.value === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function rangeStyle(value: number, max: number) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return {
    "--ws-range-progress": `${percent}%`,
    background: "linear-gradient(to right, var(--accent) var(--ws-range-progress), var(--control-border) var(--ws-range-progress))",
  };
}

function onVolInput(clientId: number, event: Event) {
  setVolume(clientId, Number((event.target as HTMLInputElement).value) / 100);
}

function resolveSkinHomeCopy(skin: InstalledSkin | null, locale: Language): SkinHomeCopy {
  const content = skin?.contentData;
  if (!content) return {};
  const fullLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : locale === "de" ? "de-DE" : locale === "ru" ? "ru-RU" : "ja-JP";
  const candidates = [...new Set([content.defaultLocale, locale, fullLocale])];
  const result: SkinHomeCopy = {};
  for (const candidate of candidates) Object.assign(result, content.locales[candidate]?.home ?? {});
  return result;
}

</script>

<style scoped src="../styles/web-client.css"></style>

<style scoped src="../styles/web-client-mobile.css"></style>
<style scoped src="../styles/public-appearance.css"></style>

<style src="../styles/skin-plugin.css"></style>
