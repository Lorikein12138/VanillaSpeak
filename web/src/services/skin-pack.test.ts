import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { importSkinPack, resolveSkinCssAssets, SkinPackError } from "./skin-pack.js";
import { scopeBuiltinThemeForCustomSkin } from "./skin-cascade.js";
import { BUILTIN_SKIN_CATALOG } from "./skin-catalog.js";
import type { SkinPluginDocument, SkinPluginNode } from "../../../src/shared/skin-plugin.js";
import { createSkinExtensionWasmPrefixByteImmediateProbe } from "../../test/skin-extension-wasm-fixture.js";

const manifest = {
  schemaVersion: 1,
  id: "ocean-night",
  name: "Ocean Night",
  version: "1.0.0",
  author: "WebSpeak test",
  license: "MIT",
  minAppVersion: "0.2.4",
  entry: "skin.css",
};

test("skin CSS is scoped, local artwork and fonts work, and global names are isolated", async () => {
  const skin = await importSkinPack(makeSkin(`
    @font-face { font-family: "Wave Font"; src: url("assets/wave.woff2") format("woff2"); }
    @keyframes shimmer { from { opacity: .4; } to { opacity: 1; } }
    :root { --skin-accent: #00a99d; }
    [data-ws-part="voice.member"] { font-family: "Wave Font", sans-serif; animation: shimmer 1s ease-in-out; background-image: image-set("assets/backdrop.png" 1x); }
  `));

  assert.match(skin.css, /\.ws-skin-root\[data-ws-skin="ocean-night"\] \{ --skin-accent: #00a99d; \}/);
  assert.match(skin.css, /@keyframes ws-ocean-night-shimmer/);
  assert.match(skin.css, /animation: ws-ocean-night-shimmer/);
  assert.match(skin.css, /font-family: "ws-ocean-night-Wave-Font"/);
  assert.match(skin.css, /url\("wskin-asset:assets%2Fwave\.woff2"\)/);
  assert.match(skin.css, /image-set\("wskin-asset:assets%2Fbackdrop\.png" 1x\)/);
  assert.ok(skin.warnings.some((warning) => warning.includes("localized text wrapping")));
  assert.equal(skin.contentData, undefined, "skin content is optional; WebSpeak supplies the base interface translations");

  const resolved = resolveSkinCssAssets(skin.css, skin.assets);
  assert.match(resolved.css, /blob:/);
  resolved.objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

test("skin CSS permits visual decoration but prevents layout, text-flow, and control-geometry changes", async () => {
  const skin = await importSkinPack(makeSkin('@keyframes fade-wave { from { opacity: 0; } to { opacity: 1; } } [data-ws-part="demo.wave"] { opacity: var(--skin-decoration-opacity); animation: fade-wave 1s; box-shadow: 0 0 14px #4ff; }'));
  assert.match(skin.css, /opacity: var\(--skin-decoration-opacity\)/);
  assert.match(skin.css, /box-shadow: 0 0 14px #4ff/);
  assert.match(skin.css, /from \{ opacity: 0; \}/);
  assert.match(skin.css, /animation: ws-ocean-night-fade-wave 1s/);

  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { display: none; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { d\\69splay: none; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { position: fixed; inset: 0; z-index: 99999; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.member"] { padding: 30px; transform: scale(1.2); }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home.hero.title"] { font-size: 3rem; line-height: 1; white-space: nowrap; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home.hero.title"] { text-transform: uppercase; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { opacity: 0; }')), (error: unknown) => error instanceof Error && error.message.includes("explicitly optional visual parts"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="demo.wave"] span { display: none; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { display: var(--skin-hidden); }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { all: unset; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('@keyframes hide-control { to { opacity: 0; } } [data-ws-part="voice.screen-player.exit"] { animation: hide-control 1s infinite; }')), (error: unknown) => error instanceof Error && error.message.includes("explicitly optional visual parts"));
  await assert.rejects(importSkinPack(makeSkin('@keyframes hide-control { to { opacity: 0; } } [data-ws-part="control"] { animation: var(--custom-animation); }')), (error: unknown) => error instanceof Error && error.message.includes("explicitly optional visual parts"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home"] { --accent: red; }')), (error: unknown) => error instanceof Error && error.message.includes("--skin- prefix"));
  await assert.rejects(importSkinPack(makeSkin(".internal-class { color: red; }")), (error: unknown) => error instanceof Error && error.message.includes("must use :root"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="demo.voice-card"].private-component { color: red; }')), (error: unknown) => error instanceof Error && error.message.includes("must use :root"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home"] { background-image: image-set("https://example.invalid/remote.png" 1x); }')), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_EXTERNAL_RESOURCE");
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home"] { background-image: u\\72l("https://example.invalid/escaped.png"); }')), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_EXTERNAL_RESOURCE");
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home"] { background-image: u\\72l(h\\74 tps\\3a //example.invalid/escaped-scheme.png); }')), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_EXTERNAL_RESOURCE");
  await assert.rejects(importSkinPack(makeSkin('@font-face { font-family: "Local Font"; src: l\\6f cal("Arial"); } [data-ws-part="home"] { color: teal; }')), (error: unknown) => error instanceof Error && error.message.includes("local() is not allowed"));
});

test("custom skins can override theme appearance without !important or private class selectors", () => {
  const css = '.ws-skin-root[data-ws-skin="builtin.dark"] .join-page .join-card { color: white; }';
  assert.equal(
    scopeBuiltinThemeForCustomSkin(css, "dark", "sample.custom-skin"),
    ':where(.ws-skin-root[data-ws-skin="sample.custom-skin"]) .join-page .join-card { color: white; }',
  );
});

test("community skins use a scoped light fallback instead of inheriting the night skin", async () => {
  const lightCss = await readFile(new URL("../skins/builtin/light/skin.css", import.meta.url), "utf8");
  const scoped = scopeBuiltinThemeForCustomSkin(lightCss, "light", "sample.custom-skin");
  assert.match(scoped, /:where\(\.ws-skin-root\[data-ws-skin="sample\.custom-skin"\]\) \{\s*color-scheme: light;/);
  assert.match(scoped, /:where\(\.ws-skin-root\[data-ws-skin="sample\.custom-skin"\]\) \.settings-content/);
});

test("built-in light and dark skins keep letterbox areas black", async () => {
  const [light, dark] = await Promise.all([
    readFile(new URL("../skins/builtin/light/skin.css", import.meta.url), "utf8"),
    readFile(new URL("../skins/builtin/dark/skin.css", import.meta.url), "utf8"),
  ]);
  for (const [css, id] of [[light, "builtin.light"], [dark, "builtin.dark"]] as const) {
    assert.match(css, new RegExp(`data-ws-skin="${id}"[^{}]*\\[data-ws-part="voice\\.screen-player\\.stage"\\] \\{ background: #000; \\}`));
    assert.match(css, new RegExp(`data-ws-skin="${id}"[^{}]*\\[data-ws-part="voice\\.screen-player\\.video"\\] \\{ object-fit: contain; background: #000; \\}`));
  }
});

async function componentSources(directory: string): Promise<string> {
  const componentRoot = new URL(directory, import.meta.url);
  const componentFiles = (await readdir(componentRoot, { recursive: true })).filter(path => path.endsWith(".vue"));
  return (await Promise.all(componentFiles.map(path => readFile(new URL(path.replaceAll("\\", "/"), componentRoot), "utf8")))).join("\n");
}

test("all public skin parts are documented and the admin console is outside skin scope", async () => {
  const [components, adminComponents] = await Promise.all([
    componentSources("../components/web-client/"), componentSources("../components/admin/"),
  ]);
  const [webClient, demo, skinSwitcher, languageSwitcher, hostChrome, pluginPanel, recoveryNotice, admin, documentation] = await Promise.all([
    readFile(new URL("../views/WebClient.vue", import.meta.url), "utf8"),
    readFile(new URL("../views/DemoView.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/SkinSwitcher.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/LanguageSwitcher.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/HostChrome.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/PluginPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/SkinLoadRecoveryNotice.vue", import.meta.url), "utf8"),
    readFile(new URL("../views/AdminView.vue", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/SKIN_DEVELOPMENT.md", import.meta.url), "utf8"),
  ]);
  const publicParts = new Set([...`${webClient}\n${components}\n${demo}\n${skinSwitcher}\n${languageSwitcher}\n${hostChrome}\n${pluginPanel}\n${recoveryNotice}`.matchAll(/data-ws-part="([^"]+)"/g)].map((match) => match[1]));
  for (const part of publicParts) assert.ok(documentation.includes(`\`${part}\``), `Undocumented skin part: ${part}`);
  assert.match(skinSwitcher, /data-ws-skin-id/);
  assert.match(skinSwitcher, /data-ws-state/);
  assert.match(languageSwitcher, /data-ws-language/);
  assert.doesNotMatch(`${admin}\n${adminComponents}`, /ws-skin-root|data-ws-page=/);
  assert.doesNotMatch(demo, /:global\(:root\[data-theme="dark"\]\)/);
  assert.match(demo, /hostTheme\.value/);
  assert.doesNotMatch(demo, /SkinPluginOutlet|usePublicSkin/);
});

test("public selectors use shared theme, focus, and action tokens", async () => {
  for (const name of ["SkinSwitcher", "LanguageSwitcher"]) {
    const source = await readFile(new URL("../components/" + name + ".vue", import.meta.url), "utf8");
    assert.match(source, /background: var\(--raised\)/);
    assert.match(source, /border: 1px solid var\(--control-border\)/);
    assert.match(source, /@keydown\.down\.prevent/);
    assert.match(source, /@keydown\.esc\.stop/);
  }
});

test("skin content supports localized interface message overrides and includes the preview as an asset", async () => {
  const content = { defaultLocale: "en", locales: { en: { home: { title: "Welcome" }, messages: { speakingNow: "Live now" } } } };
  const skin = await importSkinPack(makeSkin('[data-ws-part="demo.voice-card"] { background: url(assets/preview.png); }', content));
  assert.equal(skin.contentData?.locales.en?.messages?.speakingNow, "Live now");
  assert.equal(skin.previewBlob?.type, "image/png");
  assert.ok(skin.assets["assets/preview.png"]);
});

test("the activity artwork layer floats above room content without intercepting controls", async () => {
  const css = await readFile(new URL("../styles/web-client.css", import.meta.url), "utf8");
  assert.match(css, /\.app-shell \.workspace-content\s*\{\s*position: relative;\s*isolation: isolate;/);
  assert.match(css, /\.voice-activity-artwork\s*\{\s*position: absolute;\s*z-index: 2;\s*inset: -26px 0 -48px;[^}]*pointer-events: none;/);
  assert.match(css, /\.voice-activity-artwork\s*\{[^}]*transform: perspective\(1100px\) rotateY\(-2\.5deg\) translateZ\(22px\)/);
  assert.match(css, /:deep\(\.app-shell \.member-panel::before\)\s*\{\s*content: "";\s*position: absolute;\s*z-index: 1;\s*left: -28px;\s*bottom: 18px;\s*width: min\(430px, calc\(100vw - 24px\)\);\s*aspect-ratio: 3 \/ 2;[^}]*perspective\(1100px\) rotateY\(-8deg\)/);
  assert.match(css, /:deep\(\.app-shell \.chat-empty\[data-ws-state="messages-empty"\]\)\s*\{[^}]*min-height: 210px;\s*padding: 126px 12px 10px;/);
  assert.match(css, /:deep\(\.app-shell \.chat-panel \.section-heading\),[\s\S]*?:deep\(\.app-shell \.chat-panel \.message-composer\)\s*\{\s*position: relative;\s*z-index: 3;/);
  assert.match(css, /\.screen-share-player\)?\s*\{[^}]*background: var\(--surface-1\)/);
  assert.match(css, /\.screen-share-player-exit\)?\s*\{[^}]*z-index: 3;/);
  assert.match(css, /\.screen-share-player-stage\)?\s*\{[^}]*background: #000/);
  assert.match(css, /\.screen-share-player-video\)?\s*\{[^}]*object-fit: contain;[^}]*background: #000/);
  assert.match(css, /@media \(min-width: 741px\)\s*\{\s*\/\* Keep header menus above the independently stacked screen-share stage\. \*\/\s*\.app-shell \.workspace-header\s*\{\s*position: relative;\s*z-index: 40;/);
});

test("channel empty state removes its bubble ornament and keeps the text-channel label", async () => {
  const [view, chat] = await Promise.all([
    readFile(new URL("../components/web-client/ChatPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../composables/useWebClientChat.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(view, /data-ws-state="messages-empty"><div class="chat-empty-icon"/);
  assert.match(view, /class="section-kicker">\{\{ chatTabLabel \}\}/);
  assert.match(chat, /tab\.value === "channel" \? t\("textChannel"\)/);
});

test("mobile chat starts closed and follows viewport changes", async () => {
  const chat = await readFile(new URL("../composables/useWebClientChat.ts", import.meta.url), "utf8");
  assert.match(chat, /const panelOpen = ref\(!isMobileViewport\.value\)/);
  assert.match(chat, /watch\(isMobileViewport,[\s\S]*?panelOpen\.value = !mobile;/);
  assert.match(chat, /panelOpen\.value = !isMobileViewport\.value;/);
});

test("the host header and preferences live outside the public surface, with one join action", async () => {
  const source = await readFile(new URL("../views/WebClient.vue", import.meta.url), "utf8");
  assert.ok(source.indexOf("<WebClientHeader") < source.indexOf("'ws-skin-root'"));
  assert.match(source, /<ExtensionPreferences/);
  assert.doesNotMatch(source, /qqJoinUrl|qqModalOpen|join-card-waveform/);
  assert.match(source, /<JoinForm/);
});

function makeSkin(css: string, content?: unknown): File {
  const packageFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({ ...manifest, ...(content ? { content: "content.json" } : {}), preview: "assets/preview.png" })),
    "skin.css": strToU8(css),
    "assets/backdrop.png": new Uint8Array([1, 2, 3, 4]),
    "assets/preview.png": new Uint8Array([5, 6, 7, 8]),
    "assets/wave.woff2": new Uint8Array([9, 10, 11, 12]),
  };
  if (content) packageFiles["content.json"] = strToU8(JSON.stringify(content));
  const bytes = zipSync(packageFiles);
  return new File([bytes.slice().buffer as ArrayBuffer], "skin.wskin", { type: "application/octet-stream" });
}

test("schema version 2 skin packages load only validated declarative layouts with no permissions", async () => {
  const layout = {
    schemaVersion: 1,
    pages: {
      home: { desktop: { "home.header": { x: 48, y: -12, scale: 1.1, background: "#123456" } } },
    },
  };
  const skin = await importSkinPack(makeSkinV2(layout));
  assert.equal(skin.schemaVersion, 2);
  assert.equal(skin.packageType, "layout-skin");
  assert.deepEqual(skin.permissions, []);
  assert.equal(skin.layoutData?.pages.home?.desktop?.["home.header"]?.x, 48);
  assert.equal(skin.layoutData?.pages.home?.desktop?.["home.header"]?.background, "#123456");

  await assert.rejects(
    importSkinPack(makeSkinV2(layout, { permissions: ["network.fetch"] })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_PERMISSION_INVALID",
  );
  await assert.rejects(
    importSkinPack(makeSkinV2(layout, { capabilities: ["network.fetch"] })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_MANIFEST_INVALID",
  );
  await assert.rejects(
    importSkinPack(makeSkinV2({ schemaVersion: 1, pages: { home: { desktop: { "home.unknown": { x: 4 } } } } })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_LAYOUT_INVALID",
  );
  await assert.rejects(
    importSkinPack(makeSkinV2({ schemaVersion: 1, pages: { home: { desktop: { "home.security-note": { visible: false } } } } })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_LAYOUT_INVALID",
  );
});

test("schema version 3 supports arbitrary public layouts and validated declarative plugin components", async () => {
  const components = {
    schemaVersion: 1,
    components: [{
      id: "channel-list",
      name: "Channel list",
      page: "voice",
      accessibleName: "TeamSpeak channels",
      permissions: ["session.channels.read", "session.channel.join"],
      actions: { join: { type: "voice.joinChannel", args: { channelId: "{{channel.id}}" } } },
      root: {
        tag: "nav",
        repeat: { path: "session.channels", as: "channel" },
        children: [{ tag: "button", part: "row", events: { dblclick: "join" }, children: [{ text: "{{channel.name}}" }] }],
      },
    }],
  };
  const skin = await importSkinPack(makeSkinV3(components, `
    [data-ws-part="voice.channel-group"] { display: none; }
    .channel-row[data-ws-plugin-part="channel-list.row"] { position: fixed; inset: 10px; width: 240px; order: 1; }
  `));
  assert.equal(skin.schemaVersion, 3);
  assert.equal(skin.packageType, "open-skin");
  assert.equal(skin.pluginData?.components[0].id, "channel-list");
  assert.equal(skin.pluginData?.components[0].root.children?.[0].events?.dblclick, "join");
  assert.match(skin.css, /position: fixed/);
  assert.match(skin.css, /display: none/);
  assert.ok(skin.warnings.some((warning) => warning.includes("hides an interface part")));

  const unsafe = structuredClone(components) as typeof components;
  unsafe.components[0].permissions = ["network.fetch"];
  await assert.rejects(importSkinPack(makeSkinV3(unsafe, "[data-ws-part=app] { color: red; }")), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_PLUGIN_INVALID");
  await assert.rejects(importSkinPack(makeSkinV3({ schemaVersion: 1, components: [] }, "[data-ws-part=app] { color: red; }")), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_PLUGIN_INVALID");
  const missingAsset = structuredClone(components) as unknown as SkinPluginDocument;
  missingAsset.components[0].root = { tag: "img", asset: "assets/missing.webp" };
  await assert.rejects(importSkinPack(makeSkinV3(missingAsset, "[data-ws-part=app] { color: red; }")), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_PLUGIN_ASSET_INVALID");
});

test("schema version 3 permits an open visual skin without a components document", async () => {
  const bytes = zipSync({
    "manifest.json": strToU8(JSON.stringify({ ...manifest, schemaVersion: 3, packageType: "open-skin" })),
    "skin.css": strToU8('[data-ws-part="app"] { position: fixed; }'),
  });
  const skin = await importSkinPack(new File([bytes.slice().buffer as ArrayBuffer], "v3-visual-only.wskin"));
  assert.equal(skin.schemaVersion, 3);
  assert.equal(skin.pluginData, undefined);
  assert.match(skin.css, /position: fixed/);
});

test("schema version 3 accepts a schema v2 full-page surface with host widgets", async () => {
  const components = {
    schemaVersion: 2,
    components: [{
      id: "custom-voice-surface",
      name: "Custom voice surface",
      page: "voice",
      mode: "surface",
      accessibleName: "Custom voice workspace",
      permissions: ["ui.surface.replace"],
      actions: {},
      root: {
        tag: "main",
        className: "custom-workspace",
        children: [
          { widget: "voice.channel-panel" },
          { widget: "voice.member-cards" },
          { widget: "voice.chat-panel" },
          { widget: "voice.audio-controls" },
        ],
      },
    }],
  };
  const skin = await importSkinPack(makeSkinV3(components, '[data-ws-part="app"] { --skin-surface: #123456; }'));
  assert.equal(skin.pluginData?.schemaVersion, 2);
  assert.equal(skin.pluginData?.components[0].mode, "surface");
  assert.deepEqual(skin.pluginData?.components[0].root.children?.map((node) => node.widget), [
    "voice.channel-panel", "voice.member-cards", "voice.chat-panel", "voice.audio-controls",
  ]);
});

test("schema version 4 validates and caches isolated plugin package files without executing them", async () => {
  const defaultLayout = {
    schemaVersion: 1,
    pages: { voice: { desktop: { "skin.voice.runtime_plugin_root_voice-toolbar": { order: 2, visible: true } } } },
  };
  const skin = await importSkinPack(makeSkinV4(undefined, { layout: defaultLayout }));
  const entry = "plugins/voice-toolbar/index.js";
  const style = "plugins/voice-toolbar/style.css";
  const icon = "plugins/voice-toolbar/assets/icon.png";
  assert.equal(skin.schemaVersion, 4);
  assert.equal(skin.packageType, "open-skin");
  assert.equal(skin.runtimePlugins?.plugins[0].id, "voice-toolbar");
  assert.equal(await skin.runtimePluginFiles?.[entry].text(), "export const render = () => document.createElement('button');");
  assert.equal(await skin.runtimePluginFiles?.[style].text(), ".toolbar { color: teal; }");
  assert.equal(skin.runtimePluginFiles?.[icon].type, "image/png");
  assert.equal(skin.assets[icon]?.type, "image/png", "declared plugin media is available only by its package path for scoped CSS and host remapping");
  assert.match(skin.runtimePluginStyles?.["voice-toolbar"] ?? "", /data-ws-runtime-plugin="voice-toolbar".*?\.toolbar/s);
  assert.match(skin.runtimePluginStyles?.["voice-toolbar"] ?? "", /color: teal/);
  assert.match(skin.css, /position: fixed/);
  assert.deepEqual(skin.layoutData?.pages.voice?.desktop?.["skin.voice.runtime_plugin_root_voice-toolbar"], { order: 2, visible: true });

  await assert.rejects(
    importSkinPack(makeSkinV4(undefined, { includeEntry: false })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_RUNTIME_PLUGIN_FILE_MISSING",
  );
  await assert.rejects(
    importSkinPack(makeSkinV4(undefined, { extra: { "plugins/unlisted/rogue.js": strToU8("export {};") } })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_FILE_UNSUPPORTED",
  );
  await assert.rejects(
    importSkinPack(makeSkinV4(undefined, { entryBytes: new Uint8Array(256 * 1024 + 1) })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_RUNTIME_PLUGIN_SOURCE_SIZE",
  );
});

test("a v4 surface cannot compete with a v3 surface on the same public page", async () => {
  const components = {
    schemaVersion: 2,
    components: [{
      id: "voice-v3-surface",
      name: "Voice v3 surface",
      page: "voice",
      mode: "surface",
      accessibleName: "Voice workspace",
      permissions: ["ui.surface.replace"],
      actions: {},
      root: { tag: "main", children: [{ tag: "p", children: [{ text: "replacement UI" }] }] },
    }],
  };
  const plugins = {
    schemaVersion: 1,
    plugins: [{
      id: "voice-v4-surface",
      name: "Voice v4 surface",
      version: "1.0.0",
      apiVersion: 1,
      runtime: "wasm",
      page: "voice",
      mode: "surface",
      entry: "plugins/voice-v4-surface/index.wasm",
      assets: [],
      permissions: ["ui.surface.replace"],
    }],
  };
  const files = {
    "manifest.json": strToU8(JSON.stringify({ ...manifest, schemaVersion: 4, packageType: "open-skin", components: "components.json", plugins: "plugins.json" })),
    "skin.css": strToU8('[data-ws-part="app"] { color: teal; }'),
    "components.json": strToU8(JSON.stringify(components)),
    "plugins.json": strToU8(JSON.stringify(plugins)),
    "plugins/voice-v4-surface/index.wasm": createSkinExtensionWasmPrefixByteImmediateProbe(),
  };
  const archive = zipSync(files);
  await assert.rejects(
    importSkinPack(new File([archive.slice().buffer as ArrayBuffer], "competing-surfaces.wskin")),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_PLUGIN_SURFACE_DUPLICATE",
  );
});

test("v4 skin packages validate Wasm entry ABI and cache it as application/wasm", async () => {
  const wasmPlugin = {
    schemaVersion: 1,
    plugins: [{
      id: "voice-toolbar",
      name: "Voice toolbar",
      version: "1.0.0",
      apiVersion: 1,
      runtime: "wasm",
      page: "voice",
      mode: "widget",
      entry: "plugins/voice-toolbar/index.wasm",
      style: "plugins/voice-toolbar/style.css",
      assets: ["plugins/voice-toolbar/assets/icon.png"],
      permissions: [],
    }],
  };
  const skin = await importSkinPack(makeSkinV4(wasmPlugin, {
    entryPath: "plugins/voice-toolbar/index.wasm",
    entryBytes: createSkinExtensionWasmPrefixByteImmediateProbe(),
  }));
  assert.equal(skin.runtimePlugins?.plugins[0].runtime, "wasm");
  assert.equal(skin.runtimePluginFiles?.["plugins/voice-toolbar/index.wasm"]?.type, "application/wasm");

  await assert.rejects(
    importSkinPack(makeSkinV4(wasmPlugin, {
      entryPath: "plugins/voice-toolbar/index.wasm",
      entryBytes: new Uint8Array([0, 1, 2, 3]),
    })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_RUNTIME_PLUGIN_WASM_INVALID",
  );
});

test("the full voice surface example packages share-aware members and host-owned controls", async () => {
  const archive = await readFile(new URL("../../../docs/examples/open-voice-surface.wskin", import.meta.url));
  const file = new File([archive], "open-voice-surface.wskin", { type: "application/octet-stream" });
  const skin = await importSkinPack(file);
  assert.equal(skin.id, "community.open-voice-surface");
  assert.equal(skin.pluginData?.schemaVersion, 3);
  assert.deepEqual(skin.pluginData?.components.map((component) => [component.page, component.mode]), [
    ["home", "surface"], ["voice", "surface"],
  ]);
  const voiceSurface = skin.pluginData?.components.find((component) => component.page === "voice");
  assert.ok(voiceSurface?.permissions.includes("ui.surface.replace"));
  assert.ok(voiceSurface?.permissions.includes("servers.quickList.read"));
  assert.ok(voiceSurface?.permissions.includes("servers.quickList.switch"));
  assert.ok(voiceSurface?.permissions.includes("session.channels.read"));
  assert.ok(voiceSurface?.permissions.includes("session.members.read"));
  assert.ok(voiceSurface?.permissions.includes("voice.screenShare.read"));
  assert.ok(voiceSurface?.permissions.includes("voice.screenShare.control"));
  const openMemberWatchAction = voiceSurface?.actions["watch-screen-share"];
  assert.equal(openMemberWatchAction?.type, "voice.joinScreenShare");
  assert.equal(openMemberWatchAction?.args.streamId, "{{member.screenShareStreamId}}");
  assert.ok(skin.css.includes("@media (max-width: 800px)"));
});

test("the Discord Voice package imports portable home and voice surfaces", async () => {
  const archive = await readFile(new URL("../../../docs/examples/discord-voice.wskin", import.meta.url));
  const file = new File([archive], "discord-voice.wskin", { type: "application/octet-stream" });
  const skin = await importSkinPack(file);
  assert.equal(skin.id, "community.discord-voice");
  assert.equal(skin.minAppVersion, "0.3.2");
  assert.equal(skin.packageType, "open-skin");
  assert.equal(skin.schemaVersion, 3);
  assert.deepEqual(skin.pluginData?.components.map(({ id, page, mode }) => [id, page, mode]), [
    ["discord-home", "home", "surface"],
    ["discord-workspace", "voice", "surface"],
  ]);
  const voice = skin.pluginData?.components.find((component) => component.page === "voice");
  assert.ok(voice?.permissions.includes("ui.surface.replace"));
  assert.ok(voice?.permissions.includes("session.channels.read"));
  assert.ok(voice?.permissions.includes("session.members.read"));
  assert.ok(voice?.permissions.includes("chat.channel.send"));
  assert.ok(voice?.permissions.includes("audio.microphone.control"));
  assert.ok(voice?.permissions.includes("voice.screenShare.control"));
  assert.equal(voice?.actions["copy-invite-link"]?.type, "session.copyInviteLink");
  assert.match(JSON.stringify(voice?.root), /"widget":"voice.plugin-launcher".*?"pluginPresentation":"drawer-side"/);
  assert.equal(skin.runtimePlugins?.plugins.length ?? 0, 0, "the open skin contains no executable plugin code");
  const baseMessageKeys = Object.keys(skin.contentData?.locales.en?.messages ?? {}).sort();
  for (const locale of ["zh-CN", "de", "ru", "ja"]) {
    assert.deepEqual(
      Object.keys(skin.contentData?.locales[locale]?.messages ?? {}).sort(),
      baseMessageKeys,
      `Discord Voice provides complete skin copy for ${locale}`,
    );
  }
  assert.ok(skin.css.includes("--skin-discord-bg-guilds"));
  assert.doesNotMatch(skin.css, /\.ws-skin-root\[data-ws-skin="community\.discord-voice"\]\s+(?:strong|time)\b/, "host chat text styles stay scoped to public chat parts");
  assert.doesNotMatch(skin.css, /(?:^|[\s,])\.message-(?:meta|row|body|bubble|composer)\b/, "the package does not depend on private chat CSS classes");
  assert.ok(skin.css.includes("@media (max-width: 760px)"));
});

test("the Harbor voice skin imports a complete voice-only KOOK-inspired workspace", async () => {
  const archive = await readFile(new URL("../../../docs/examples/harbor-voice.wskin", import.meta.url));
  const file = new File([archive], "harbor-voice.wskin", { type: "application/octet-stream" });
  const skin = await importSkinPack(file);
  assert.equal(skin.id, "community.harbor-voice");
  assert.equal(skin.pluginData?.schemaVersion, 3);
  assert.deepEqual(skin.pluginData?.components.map((component) => [component.page, component.mode]), [
    ["home", "surface"], ["voice", "surface"],
  ]);
  const voiceSurface = skin.pluginData?.components.find((component) => component.page === "voice");
  assert.ok(voiceSurface?.permissions.includes("session.channel.join"));
  assert.ok(voiceSurface?.permissions.includes("servers.quickList.switch"));
  assert.ok(voiceSurface?.permissions.includes("session.members.read"));
  assert.ok(voiceSurface?.permissions.includes("chat.channel.read"));
  assert.ok(voiceSurface?.permissions.includes("chat.channel.send"));
  assert.ok(voiceSurface?.permissions.includes("audio.microphone.control"));
  assert.ok(voiceSurface?.permissions.includes("audio.output.control"));
  assert.ok(voiceSurface?.permissions.includes("voice.screenShare.control"));
  assert.ok(voiceSurface?.permissions.includes("voice.screenShare.read"));
  function findPart(node: SkinPluginNode | undefined, part: string): SkinPluginNode | undefined {
    if (!node) return undefined;
    if (node.part === part) return node;
    for (const child of node.children ?? []) {
      const found = findPart(child, part);
      if (found) return found;
    }
    return undefined;
  }
  const channelRow = findPart(voiceSurface?.root, "channel-row");
  assert.equal(channelRow?.events?.click, "select-channel", "single-click only selects a channel in this skin");
  assert.equal(channelRow?.events?.dblclick, "join-channel", "channel switching follows TeamSpeak's double-click join behavior");
  assert.equal(channelRow?.attributes?.["data-depth"], "{{channel.depth}}", "the channel hierarchy is represented without a new host API");
  assert.equal(findPart(channelRow, "selected-channel-indicator")?.when?.equals, "{{channel.id}}");
  const identityEntry = findPart(voiceSurface?.root, "identity-entry");
  assert.equal(identityEntry?.attributes?.role, "group");
  assert.equal(identityEntry?.when?.path, "session.status.userName");
  assert.equal(findPart(identityEntry, "identity-name")?.children?.[0]?.text, "{{session.status.userName}}");
  const channelVoiceMembers = findPart(voiceSurface?.root, "channel-voice-members");
  assert.equal(channelVoiceMembers?.when?.path, "channel.current");
  assert.equal(findPart(channelVoiceMembers, "channel-voice-member")?.repeat?.path, "channel.members");
  assert.equal(findPart(channelVoiceMembers, "channel-member-muted")?.when?.path, "voicemember.status");
  assert.equal(findPart(voiceSurface?.root, "member-away-state")?.when?.path, "member.status");
  assert.equal(findPart(voiceSurface?.root, "member-screen-share")?.when?.path, "member.screenSharing");
  assert.equal(voiceSurface?.actions["watch-screen-share"]?.type, "voice.joinScreenShare");
  assert.equal(voiceSurface?.actions["watch-channel-member-screen-share"]?.type, "voice.joinScreenShare");
  const voiceDockActions = findPart(voiceSurface?.root, "voice-dock-actions");
  assert.equal(findPart(voiceDockActions, "screen-share-start")?.widget, "voice.screen-share-start");
  assert.equal(findPart(voiceDockActions, "audio-controls")?.widget, "voice.audio-controls");
  assert.equal(findPart(voiceDockActions, "disconnect-control")?.events?.click, "disconnect");
  const chat = findPart(voiceSurface?.root, "chat");
  assert.equal(findPart(chat, "chat-message")?.repeat?.path, "chat.messages");
  assert.equal(findPart(chat, "chat-composer")?.events?.submit, "send-message");
  assert.equal(findPart(chat, "chat-input")?.bindValue, "message");
  assert.equal(findPart(chat, "chat-empty")?.when?.empty, true);
  assert.equal(findPart(voiceSurface?.root, "whisper-start")?.events?.click, "whisper-on");
  assert.ok(skin.css.includes("@media (max-width: 820px)"));
  assert.ok(skin.css.includes('[data-ws-plugin-part="harbor-workspace.channel-row"][data-depth="1"]'));
  assert.ok(skin.css.includes('[data-ws-plugin-part="harbor-workspace.identity-entry"]'));
  assert.ok(skin.css.includes('data-ws-plugin-part="harbor-workspace.screen-share-start"'), "the host screen-share control uses the stable plugin part hook");
  assert.ok(skin.css.includes(".accompaniment-toggle { display: none; }"));
  assert.ok(!skin.css.includes("https://"), "the skin uses no remote artwork or font resources");
});

function makeSkinV2(layout: unknown, manifestChanges: Record<string, unknown> = {}): File {
  const packageFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({
      ...manifest,
      schemaVersion: 2,
      packageType: "layout-skin",
      layout: "layout.json",
      permissions: [],
      ...manifestChanges,
    })),
    "skin.css": strToU8('[data-ws-part="home.header"] { color: #123456; }'),
    "layout.json": strToU8(JSON.stringify(layout)),
  };
  const bytes = zipSync(packageFiles);
  return new File([bytes.slice().buffer as ArrayBuffer], "skin-v2.wskin", { type: "application/octet-stream" });
}

function makeSkinV3(components: unknown, css: string, assets: Record<string, Uint8Array> = {}): File {
  const packageFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({ ...manifest, schemaVersion: 3, packageType: "open-skin", components: "components.json" })),
    "skin.css": strToU8(css),
    "components.json": strToU8(JSON.stringify(components)),
    ...assets,
  };
  const bytes = zipSync(packageFiles);
  return new File([bytes.slice().buffer as ArrayBuffer], "skin-v3.wskin", { type: "application/octet-stream" });
}

function makeSkinV4(
  pluginDocument: unknown = {
    schemaVersion: 1,
    plugins: [{
      id: "voice-toolbar",
      name: "Voice toolbar",
      version: "1.0.0",
      apiVersion: 1,
      page: "voice",
      mode: "widget",
      entry: "plugins/voice-toolbar/index.js",
      style: "plugins/voice-toolbar/style.css",
      assets: ["plugins/voice-toolbar/assets/icon.png"],
      permissions: ["session.channels.read"],
    }],
  },
  options: { includeEntry?: boolean; entryBytes?: Uint8Array; entryPath?: string; layout?: unknown; extra?: Record<string, Uint8Array> } = {},
): File {
  const packageFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({ ...manifest, schemaVersion: 4, packageType: "open-skin", plugins: "plugins.json", ...(options.layout ? { layout: "layout.json" } : {}) })),
    "skin.css": strToU8('[data-ws-part="app"] { position: fixed; color: teal; }'),
    "plugins.json": strToU8(JSON.stringify(pluginDocument)),
    ...(options.layout ? { "layout.json": strToU8(JSON.stringify(options.layout)) } : {}),
    "plugins/voice-toolbar/style.css": strToU8(".toolbar { color: teal; }"),
    "plugins/voice-toolbar/assets/icon.png": new Uint8Array([1, 2, 3, 4]),
    ...options.extra,
  };
  const entryPath = options.entryPath ?? "plugins/voice-toolbar/index.js";
  if (options.includeEntry !== false) packageFiles[entryPath] = options.entryBytes ?? strToU8("export const render = () => document.createElement('button');");
  const bytes = zipSync(packageFiles);
  return new File([bytes.slice().buffer as ArrayBuffer], "skin-v4.wskin", { type: "application/octet-stream" });
}

function makeChromeSkin(
  chrome: unknown,
  options: { schemaVersion?: number; css?: string; icons?: Record<string, Uint8Array>; manifestChanges?: Record<string, unknown> } = {},
): File {
  const schemaVersion = options.schemaVersion ?? 3;
  const icons = options.icons ?? { "assets/icons/language.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]) };
  const packageFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({
      ...manifest,
      schemaVersion,
      ...(schemaVersion >= 3 ? { packageType: "open-skin" } : {}),
      chrome: "chrome.json",
      ...options.manifestChanges,
    })),
    "skin.css": strToU8(options.css ?? '[data-ws-part="host.plugins.launcher"] { background: #1d4f9c; }'),
    "chrome.json": strToU8(JSON.stringify(chrome)),
    ...icons,
  };
  const bytes = zipSync(packageFiles);
  return new File([bytes.slice().buffer as ArrayBuffer], "skin-chrome.wskin", { type: "application/octet-stream" });
}

test("open skins can theme host chrome and declare hidden parts plus bitmap icon overrides", async () => {
  const skin = await importSkinPack(makeChromeSkin({
    schemaVersion: 1,
    hiddenParts: ["host.watermark", "host.hint"],
    icons: { "language.trigger": "assets/icons/language.png" },
  }));
  assert.deepEqual(skin.chromeData?.hiddenParts, ["host.watermark", "host.hint"]);
  assert.equal(skin.chrome, "chrome.json");
  assert.match(skin.css, /:root\[data-ws-host-skin="ocean-night"\] \[data-ws-part="host\.plugins\.launcher"\]/);
  assert.match(skin.css, /:root\[data-ws-host-skin="ocean-night"\] \[data-ws-part="host\.watermark"\] \{ display: none !important; \}/);
  assert.match(skin.css, /\[data-ws-icon-slot="language\.trigger"\] \{ background-image: url\("wskin-asset:assets%2Ficons%2Flanguage\.png"\)/);
  const resolved = resolveSkinCssAssets(skin.css, skin.assets);
  assert.match(resolved.css, /blob:/);
  resolved.objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

test("chrome.json rejects protected hidden parts, unsafe icon paths, oversized bitmaps and old schema versions", async () => {
  const protectedPart = makeChromeSkin({ schemaVersion: 1, hiddenParts: ["voice.audio-dock"], icons: { "language.trigger": "assets/icons/language.png" } });
  await assert.rejects(importSkinPack(protectedPart), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_CHROME_HIDDEN_INVALID");

  const badPath = makeChromeSkin({ schemaVersion: 1, icons: { "language.trigger": "../icons/language.png" } });
  await assert.rejects(importSkinPack(badPath), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_ICON_PATH");

  const missingIcon = makeChromeSkin({ schemaVersion: 1, icons: { "language.trigger": "assets/icons/missing.png" } }, { icons: {} });
  await assert.rejects(importSkinPack(missingIcon), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_ICON_MISSING");

  const oversized = makeChromeSkin({ schemaVersion: 1, icons: { "language.trigger": "assets/icons/language.png" } }, {
    icons: { "assets/icons/language.png": new Uint8Array(64 * 1024 + 1) },
  });
  await assert.rejects(importSkinPack(oversized), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_ICON_SIZE");

  await assert.rejects(importSkinPack(makeChromeSkin({ schemaVersion: 1 }, { schemaVersion: 1 })),
    (error: unknown) => error instanceof SkinPackError);
  await assert.rejects(importSkinPack(makeChromeSkin({ schemaVersion: 1 }, { schemaVersion: 2 })),
    (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_MANIFEST_INVALID");
});

test("open skin CSS cannot escape the host scope or hide essential controls", async () => {
  await assert.rejects(
    importSkinPack(makeChromeSkin({ schemaVersion: 1 }, { css: 'html [data-ws-part="host.watermark"] { color: red; }' })),
    (error: unknown) => error instanceof SkinPackError && /cannot target html or body/.test(error.message),
  );
  await assert.rejects(
    importSkinPack(makeChromeSkin({ schemaVersion: 1 }, { css: '[data-ws-part="voice.audio-dock"] { display: none; }' })),
    (error: unknown) => error instanceof SkinPackError && /must remain available/.test(error.message),
  );
});
