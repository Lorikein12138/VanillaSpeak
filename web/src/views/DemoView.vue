<template>
  <div class="demo-page ws-skin-root" :data-ws-skin="activeSkinId" :lang="language" data-ws-part="app" data-ws-page="demo">
    <header class="demo-header" data-ws-part="demo.header">
      <ProductBrand :size="32" :home-label="appearanceCopy(language).home" />
      <div class="demo-tools" data-ws-part="demo.header-tools"><span class="demo-badge" data-ws-part="demo.badge">{{ copy.demoBadge }}</span><SkinSwitcher :model-value="activeSkinId" data-ws-part="demo.skin-switcher" :menu-label="appearanceCopy(language).theme" :options="skinOptions" @change="onSkinChange" /><LanguageSwitcher skin-icon v-model="language" data-ws-part="demo.language-switcher" :menu-label="copy.languageMenu" @change="persistLanguage" /><a href="/" data-ws-part="demo.home-link">{{ copy.back }}</a></div>
    </header>

    <div v-if="reconnecting" class="demo-reconnect" data-ws-part="demo.reconnect" role="status"><Icon name="refresh" :size="17" /><span>{{ copy.reconnecting }}</span><button type="button" data-ws-part="demo.reconnect.restore" @click="reconnecting = false">{{ copy.restore }}</button></div>
    <main class="demo-shell" data-ws-part="demo.layout">
      <aside class="demo-channel-panel" data-ws-part="demo.channels">
        <div class="demo-panel-title" data-ws-part="demo.channels.heading"><span>{{ copy.channels }}</span><strong>{{ selectedChannel.name }}</strong></div>
        <div v-for="channel in channels" :key="channel.id" :class="['demo-channel', { active: selectedChannelId === channel.id }]" data-ws-part="demo.channel" :data-ws-state="selectedChannelId === channel.id ? 'active' : 'idle'">
          <button type="button" data-ws-part="demo.channel.select" @click="selectChannel(channel.id)"><Icon name="volume" :size="16" /><span>{{ channel.name }}</span><small>{{ channel.members.length }}</small></button>
          <div class="demo-channel-members" data-ws-part="demo.channel.members"><span v-for="member in channel.members" :key="member.id" :class="{ speaking: speakingId === member.id }"><i :style="avatarStyle(member.name)">{{ member.name[0] }}</i>{{ member.name }}</span></div>
        </div>
      </aside>

      <section class="demo-main" data-ws-part="demo.main">
        <div class="demo-hero" data-ws-part="demo.hero"><div><span class="demo-live" data-ws-part="demo.live"><i></i>{{ copy.simulated }}</span><h1 data-ws-part="demo.hero.title"><Icon name="volume" :size="24" /> {{ selectedChannel.name }}</h1><p data-ws-part="demo.hero.description">{{ copy.heroLead }}</p><small data-ws-part="demo.hero.online"><Icon name="users" :size="14" /> {{ selectedChannel.members.length }} {{ copy.online }}</small></div><div class="demo-wave" data-ws-part="demo.wave" aria-hidden="true"><i v-for="bar in bars" :key="bar" :style="{ height: `${bar}px` }"></i></div></div>
        <div class="demo-section-heading" data-ws-part="demo.voice-heading"><span>{{ copy.voiceActivity }}</span><strong>{{ copy.speakingNow }}</strong></div>
        <div class="demo-voice-grid" data-ws-part="demo.voice-grid">
          <article
            v-for="member in selectedChannel.members"
            :key="member.id"
            :class="['demo-voice-card', { speaking: speakingId === member.id }]"
            data-ws-part="demo.voice-card"
            :data-ws-state="speakingId === member.id ? 'speaking' : 'connected'"
            role="button"
            tabindex="0"
            :aria-pressed="speakingId === member.id"
            @click="speakingId = member.id"
            @keydown.enter.prevent="speakingId = member.id"
            @keydown.space.prevent="speakingId = member.id"
          >
            <i data-ws-part="demo.avatar" :style="avatarStyle(member.name)">{{ member.name[0] }}</i>
            <strong data-ws-part="demo.member-name">{{ member.name }}</strong>
            <span data-ws-part="demo.member-status">{{ speakingId === member.id ? copy.speaking : copy.connected }}</span>
          </article>
        </div>

        <div class="demo-chat-head" data-ws-part="demo.chat.heading"><div><span>{{ copy.textChannel }}</span><strong># {{ selectedChannel.name }} {{ copy.chat }}</strong></div><div class="demo-tabs" data-ws-part="demo.chat.tabs"><button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" data-ws-part="demo.chat.tab" :data-ws-state="activeTab === tab.id ? 'active' : 'idle'" @click="activeTab = tab.id">{{ tab.label }}</button></div></div>
        <div class="demo-messages" data-ws-part="demo.chat.messages"><div v-for="message in visibleMessages" :key="message.id" :class="['demo-message', { mine: message.mine }]" data-ws-part="demo.chat.message" :data-ws-state="message.mine ? 'mine' : 'other'" @dblclick="message.mine = !message.mine"><i :style="avatarStyle(message.author)">{{ message.author[0] }}</i><div><small>{{ message.author }} · {{ message.time }}</small><p>{{ messageText(message) }}</p></div></div><div v-if="!visibleMessages.length" class="demo-empty" data-ws-part="demo.chat.empty"><Icon name="message" :size="22" /><strong>{{ copy.emptyChat }}</strong></div></div>
        <form class="demo-composer" data-ws-part="demo.chat.composer" @submit.prevent="sendMessage"><input v-model="draft" data-ws-part="demo.chat.input" :placeholder="copy.placeholder" :aria-label="copy.placeholder" /><button type="submit" data-ws-part="demo.chat.send" :disabled="!draft.trim()"><Icon name="send" :size="17" /></button></form>
      </section>

      <aside class="demo-actions-panel" data-ws-part="demo.actions"><div class="demo-panel-title" data-ws-part="demo.actions.heading"><span>{{ copy.voice }}</span><strong>{{ copy.simulationControls }}</strong></div><button type="button" data-ws-part="demo.action.speaking" @click="toggleSpeaking"><Icon name="mic" :size="17" /> {{ speakingId ? copy.stopSpeaking : copy.simulateSpeaking }}</button><button type="button" data-ws-part="demo.action.poke" @click="poke = !poke"><Icon name="bell" :size="17" /> {{ copy.poke }}</button><button type="button" data-ws-part="demo.action.reconnect" @click="reconnecting = true"><Icon name="refresh" :size="17" /> {{ copy.simulateReconnect }}</button><div class="demo-note" data-ws-part="demo.note"><Icon name="shield" :size="16" /><span>{{ copy.demoNote }}</span></div><div class="demo-user" data-ws-part="demo.user"><i :style="avatarStyle('demo-guest')">D</i><div><strong>demo-guest</strong><small>{{ copy.you }} · {{ copy.ready }}</small></div><span class="demo-green-dot"></span></div></aside>
    </main>
    <div v-if="poke" class="demo-poke" data-ws-part="demo.poke-notification" role="status"><Icon name="bell" :size="17" /><span><strong>msicbot</strong> {{ copy.pokedYou }}</span><button type="button" data-ws-part="demo.poke.dismiss" @click="poke = false"><Icon name="close" :size="14" /></button></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import ProductBrand from "../components/ProductBrand.vue";
import { appearanceCopy } from "../i18n/appearance.js";
import { hostTheme, saveTheme } from "../services/theme.js";
import Icon from "../components/Icon.vue";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import SkinSwitcher, { type SkinOption } from "../components/SkinSwitcher.vue";
import { saveLocalPreferences } from "../services/local-persistence.js";
import { BUILTIN_DARK_SKIN, BUILTIN_LIGHT_SKIN } from "../services/skin-runtime.js";

type Language = "zh" | "en" | "de" | "ru" | "ja";
interface DemoMessage { id: number; author: string; time: string; text: string; zhText?: string; enText?: string; ruText?: string; jaText?: string; mine: boolean }
type Tab = "channel" | "server";
const storedLanguage = localStorage.getItem("webspeak:language");
const language = ref<Language>(storedLanguage === "en" || storedLanguage === "de" || storedLanguage === "ru" || storedLanguage === "ja" ? storedLanguage : "zh");
const copy = computed(() => language.value === "zh" ? zh : language.value === "de" ? de : language.value === "ru" ? ru : language.value === "ja" ? ja : en);
const activeSkinId = computed(() => hostTheme.value === "dark" ? BUILTIN_DARK_SKIN : BUILTIN_LIGHT_SKIN);
const skinOptions = computed<SkinOption[]>(() => [
  { value: BUILTIN_LIGHT_SKIN, label: appearanceCopy(language.value).day, icon: "sun" },
  { value: BUILTIN_DARK_SKIN, label: appearanceCopy(language.value).night, icon: "moon" },
]);
function onSkinChange(id: string) { saveTheme(id === BUILTIN_DARK_SKIN ? "dark" : "light"); }
const selectedChannelId = ref("quiet");
const activeTab = ref<Tab>("channel");
const speakingId = ref("demo-guest");
const reconnecting = ref(false);
const poke = ref(false);
const draft = ref("");
const bars = [15, 31, 21, 42, 25, 50, 32, 21, 38, 27, 45, 18, 33];
const channels = [
  { id: "quiet", name: "Quiet Zone", members: [{ id: "demo-guest", name: "demo-guest" }, { id: "msicbot", name: "msicbot" }] },
  { id: "lounge", name: "Lounge", members: [{ id: "alice", name: "Alice" }] },
  { id: "music", name: "Music room", members: [] },
];
const messages = ref<DemoMessage[]>([
  { id: 1, author: "demo-guest", time: "10:24", text: "", zhText: "大家好，欢迎来到 VanillaSpeak。", enText: "Hello everyone, welcome to VanillaSpeak.", mine: true },
  { id: 2, author: "msicbot", time: "10:25", text: "", zhText: "语音和文字频道都已同步。", enText: "Voice and text channels are in sync.", mine: false },
]);
const zh = { languageMenu: "语言", skinSelector: "皮肤", skinDay: "日间", skinNight: "夜间", browserClient: "浏览器语音工作台", demoBadge: "演示 — 模拟数据", back: "返回主页", reconnecting: "连接中断，正在恢复…", restore: "恢复连接", channels: "频道", channel: "频道", simulated: "演示状态", heroLead: "这里展示 VanillaSpeak 的频道、语音和聊天交互。", online: "人在线", voiceActivity: "语音活动", speakingNow: "正在语音中", speaking: "正在说话…", connected: "已连接", textChannel: "文字频道", chat: "聊天", server: "服务器", emptyChat: "暂无消息", placeholder: "发送一条消息…", voice: "语音", simulationControls: "模拟控制", stopSpeaking: "停止说话", simulateSpeaking: "模拟发言", poke: "戳一戳", simulateReconnect: "模拟重连", demoNote: "此页面不会连接真实 TeamSpeak 服务器。", you: "你", ready: "已就绪", pokedYou: "戳了你一下" };
const en = { languageMenu: "Language", skinSelector: "Skin", skinDay: "Day", skinNight: "Night", browserClient: "Browser voice workspace", demoBadge: "Demo — simulated data", back: "Back home", reconnecting: "Connection interrupted, recovering…", restore: "Restore", channels: "Channels", channel: "Channel", simulated: "Simulation", heroLead: "A preview of VanillaSpeak channels, voice, and chat interactions.", online: "online", voiceActivity: "Voice activity", speakingNow: "Speaking now", speaking: "Speaking…", connected: "Connected", textChannel: "Text channel", chat: "chat", server: "Server", emptyChat: "No messages yet", placeholder: "Send a message…", voice: "Voice", simulationControls: "Simulation controls", stopSpeaking: "Stop speaking", simulateSpeaking: "Simulate speaking", poke: "Poke", simulateReconnect: "Simulate reconnect", demoNote: "This page never connects to a real TeamSpeak server.", you: "You", ready: "Ready", pokedYou: "poked you" };
const de = { languageMenu: "Sprache", skinSelector: "Design", skinDay: "Tag", skinNight: "Nacht", browserClient: "Sprachbereich im Browser", demoBadge: "Demo — simulierte Daten", back: "Zur Startseite", reconnecting: "Verbindung unterbrochen, Wiederherstellung…", restore: "Wiederherstellen", channels: "Kanäle", channel: "Kanal", simulated: "Simulation", heroLead: "Eine Vorschau auf Kanäle, Sprache und Chat von VanillaSpeak.", online: "online", voiceActivity: "SPRACHAKTIVITÄT", speakingNow: "Spricht gerade", speaking: "Spricht…", connected: "Verbunden", textChannel: "TEXTKANAL", chat: "Chat", server: "Server", emptyChat: "Noch keine Nachrichten", placeholder: "Nachricht senden…", voice: "Sprache", simulationControls: "Simulation steuern", stopSpeaking: "Sprechen stoppen", simulateSpeaking: "Sprechen simulieren", poke: "Anstupsen", simulateReconnect: "Verbindung simulieren", demoNote: "Diese Seite verbindet sich nie mit einem echten TeamSpeak-Server.", you: "Du", ready: "Bereit", pokedYou: "hat dich angestupst" };
const ru = { languageMenu: "Язык", skinSelector: "Оформление", skinDay: "День", skinNight: "Ночь", browserClient: "Голосовое пространство в браузере", demoBadge: "Демо — симуляция", back: "На главную", reconnecting: "Соединение прервано, восстановление…", restore: "Восстановить", channels: "Каналы", channel: "Канал", simulated: "Симуляция", heroLead: "Предпросмотр каналов, голоса и чата VanillaSpeak.", online: "онлайн", voiceActivity: "ГОЛОСОВАЯ АКТИВНОСТЬ", speakingNow: "Сейчас говорят", speaking: "Говорит…", connected: "Подключён", textChannel: "ТЕКСТОВЫЙ КАНАЛ", chat: "чат", server: "Сервер", emptyChat: "Сообщений пока нет", placeholder: "Написать сообщение…", voice: "Голос", simulationControls: "Управление симуляцией", stopSpeaking: "Остановить речь", simulateSpeaking: "Симулировать речь", poke: "Толкнуть", simulateReconnect: "Симулировать переподключение", demoNote: "Эта страница не подключается к реальному серверу TeamSpeak.", you: "Вы", ready: "Готово", pokedYou: "толкнул вас" };
const ja = { languageMenu: "言語", skinSelector: "スキン", skinDay: "昼", skinNight: "夜", browserClient: "ブラウザ音声ワークスペース", demoBadge: "デモ — シミュレーション", back: "ホームに戻る", reconnecting: "接続が中断されました。復旧中…", restore: "復旧", channels: "チャンネル", channel: "チャンネル", simulated: "シミュレーション", heroLead: "VanillaSpeak のチャンネル、音声、チャットのプレビューです。", online: "人がオンライン", voiceActivity: "音声アクティビティ", speakingNow: "発話中", speaking: "発話中…", connected: "接続済み", textChannel: "テキストチャンネル", chat: "チャット", server: "サーバー", emptyChat: "メッセージはありません", placeholder: "メッセージを送信…", voice: "音声", simulationControls: "シミュレーション操作", stopSpeaking: "発話を停止", simulateSpeaking: "発話をシミュレート", poke: "つつく", simulateReconnect: "再接続をシミュレート", demoNote: "このページは実際の TeamSpeak サーバーには接続しません。", you: "あなた", ready: "準備完了", pokedYou: "あなたをつつきました" };
const tabs = computed(() => [{ id: "channel" as const, label: copy.value.channel }, { id: "server" as const, label: copy.value.server }]);
const selectedChannel = computed(() => channels.find((channel) => channel.id === selectedChannelId.value) ?? channels[0]);
const visibleMessages = computed(() => activeTab.value === "channel" ? messages.value : []);

function persistLanguage() { localStorage.setItem("webspeak:language", language.value); void saveLocalPreferences({ schemaVersion: 1, language: language.value }); }
function selectChannel(id: string) { selectedChannelId.value = id; activeTab.value = "channel"; }
function toggleSpeaking() { speakingId.value = speakingId.value ? "" : selectedChannel.value.members[0]?.id ?? ""; }
function messageText(message: DemoMessage): string { return language.value === "zh" ? message.zhText ?? message.text : language.value === "ru" ? message.ruText ?? message.enText ?? message.text : language.value === "ja" ? message.jaText ?? message.enText ?? message.text : message.enText ?? message.text; }
function sendMessage() { const text = draft.value.trim(); if (!text) return; messages.value.push({ id: Date.now(), author: "demo-guest", time: "now", text, mine: true }); draft.value = ""; }
function avatarStyle(name: string) { let hash = 0; for (const char of name) hash = char.charCodeAt(0) + ((hash << 5) - hash); const colors = ["#168f83", "#7b9ed0", "#b99070", "#8b78b9"]; return { background: colors[Math.abs(hash) % colors.length] }; }

</script>

<style scoped src="../styles/demo-appearance.css"></style>
