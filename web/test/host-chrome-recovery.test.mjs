import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { compileSkinCss } from "../../src/shared/skin-css.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const CHROME = [process.env.WEBSPEAK_TEST_CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
  .find((candidate) => candidate && existsSync(candidate));

const compileHostile = (css) => compileSkinCss(css, "community.hostile-fixture", {}, 3).css;

/**
 * Hostile rules that the compiler still accepts (they are legitimate page /
 * themable-host styling) but that must not be able to hide, cover, or disable
 * the recovery entry. `fullscreen-audio-dock` is the case the previous review
 * reproduced: a public part promoted to a `z-index: 2147483647` fullscreen layer.
 */
const scenarios = [
  {
    name: "fullscreen-audio-dock",
    css: compileHostile('[data-ws-part="voice.audio-dock"] { position: fixed; inset: 0; z-index: 2147483647; }'),
  },
  {
    name: "opacity-launcher",
    css: compileHostile('[data-ws-part="host.plugins.launcher"] { opacity: 0; }'),
  },
  {
    name: "filter-launcher",
    css: compileHostile('[data-ws-part="host.plugins.launcher"] { filter: opacity(0); }'),
  },
  {
    name: "display-none-overlay",
    css: compileHostile('[data-ws-part="host.plugins.overlay"] { display: none !important; }'),
  },
  {
    name: "pointer-events-none",
    css: compileHostile('[data-ws-part="host.plugins.launcher"], [data-ws-part="host.plugins.overlay"] { pointer-events: none !important; }'),
  },
];

test("host chrome renders recovery and revocation in a closed-shadow top layer", async () => {
  const [hostChrome, ownedLayer, hostChromeService, publicSkin] = await Promise.all([
    read("../src/components/HostChrome.vue"),
    read("../src/services/host-owned-layer.ts"),
    read("../src/services/host-chrome.ts"),
    read("../src/composables/usePublicSkin.ts"),
  ]);

  // Recovery: closed shadow root + manual popover + no skin hook.
  assert.match(hostChrome, /createHostOwnedLayer\("recovery"/);
  assert.match(hostChrome, /popover="manual"/);
  assert.match(hostChrome, /data-ws-recovery-action="built-in"/);
  assert.match(hostChrome, /requestBuiltInSkin/);
  assert.match(hostChrome, /isThirdPartySkinActive/);
  assert.doesNotMatch(hostChrome, /data-ws-part="host\.recovery"/);
  assert.doesNotMatch(hostChrome, /ws-host-recovery-layer/);

  assert.match(hostChrome, /data-ws-recovery-action="disable"/);

  // The layer itself: closed shadow root, no data-ws-part, fixed fallback.
  assert.match(ownedLayer, /attachShadow\(\{ mode: "closed" \}\)/);
  assert.match(ownedLayer, /data-ws-host-layer/);
  assert.doesNotMatch(ownedLayer, /setAttribute\("data-ws-part"/);

  // The reset path is independent of the skinnable plugin overlay.
  assert.match(hostChromeService, /requestBuiltInSkin/);
  assert.match(hostChromeService, /isThirdPartySkinActive/);
  assert.match(publicSkin, /hostBuiltInSkinRequests/);
  assert.match(publicSkin, /switchToBuiltIn/);

  // Defense in depth: there is still no compiler route to a "host.recovery"
  // selector, even if a node ever regressed to carrying that attribute.
  for (const selector of ['[data-ws-part="host.recovery"]', '[data-ws-part="host.permission"]']) {
    assert.throws(() => compileSkinCss(`${selector} { display: none; }`, "community.evil", {}, 3), /Trusted or unknown host part/);
  }

  // A leading `:root` must not reach body-level siblings (the host layer in the
  // preview/fixture topology) through `+` / `~`.
  for (const selector of [
    ":root ~ [data-ws-host-layer]",
    ":root ~ *",
    ":root + [data-ws-host-layer]",
    ":root:hover ~ *",
  ]) {
    assert.throws(
      () => compileSkinCss(`${selector} { display: none !important; }`, "community.evil", {}, 3),
      /sibling combinator after :root/,
      selector,
    );
  }
});

test("the public-skin composable opts in only through chrome.json#visibleParts", async () => {
  const usePublicSkin = await read("../src/composables/usePublicSkin.ts");
  assert.match(usePublicSkin, /setSkinHostChromeParts\(skin\?\.chromeData\)/);
  // Sniffing the combined stylesheet would match the importer-generated
  // hiddenParts/icon CSS and leak decorations for hiddenParts-only packs.
  assert.doesNotMatch(usePublicSkin, /\.test\(skin\.css\)/);
});

async function dumpDom(url, extraArgs = []) {
  return await new Promise((resolve, reject) => {
    const child = spawn(CHROME, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      ...extraArgs,
      "--dump-dom",
      url,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Headless Chrome timed out.\n${stderr.slice(-2000)}`));
    }, 60000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!stdout.includes('id="result"')) {
        reject(new Error(`Headless Chrome exited ${code} without a result.\n${stderr.slice(-2000)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

test("recovery stays visible and clickable under hostile compiled skins", { skip: !CHROME && "google-chrome is not installed" }, async (t) => {
  const server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    logLevel: "silent",
    // Keep the page's load pending during the real compact delay. Virtual
    // time can drop native dialog close events after the delay elapses.
    plugins: [{
      name: "recovery-fixture-load",
      configureServer(vite) {
        vite.middlewares.use("/test/fixtures/host-chrome-recovery-load", (_request, response) => {
          const timer = setTimeout(() => { response.writeHead(204); response.end(); }, 8000);
          response.once("close", () => clearTimeout(timer));
        });
      },
    }],
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, ws: false },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  const port = address && typeof address === "object" ? address.port : 0;
  assert.ok(port, "Vite did not expose a listening port");

  const hash = encodeURIComponent(JSON.stringify(scenarios));
  const dom = await dumpDom(`http://127.0.0.1:${port}/test/fixtures/host-chrome-recovery.html#${hash}`, ["--timeout=15000", "--window-size=360,700"]);
  const match = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "the fixture did not emit a result block");
  const payload = JSON.parse(match[1]);
  assert.equal(payload.error, undefined, payload.error);
  assert.equal(payload.results.length, scenarios.length);


  assert.deepEqual(payload.keyboardRecovery, {
    closedBeforeShortcut: true,
    opened: true,
    focusedAction: "built-in",
    closedByEscape: true,
  });

  // The pre-Popover / rejected-promotion fallback must actually lay the capsule
  // out: a closed [popover] is display:none !important until the attribute goes.
  assert.deepEqual(payload.preferences, {
    actionCount: 4,
    compactSlotted: true,
    compactFocusExpanded: true,
    preferencesModal: true,
    compactWhileModal: true,
    preferencesFocusRestored: true,
    themeFocusRestored: true,
    revokeFocusRestored: true,
    revokedInPreferences: true,
  });
  const { buttonHeight, ...failureBanner } = payload.failureBanner;
  assert.ok(buttonHeight >= 44, JSON.stringify(payload.failureBanner));
  assert.deepEqual(failureBanner, {
    bannerInteractive: true, bannerNightSurface: true, bannerResetCount: 1, bannerDismissed: true,
  });
  assert.equal(payload.authorizationDisabled, true);
  assert.equal(payload.closedAfterRevocation, true);
  assert.ok(payload.popoverFallback, "the fixture did not exercise the popover fallback");
  assert.equal(payload.popoverFallback.display, "flex", "the fallback capsule is not displayed");
  assert.equal(payload.popoverFallback.popoverAttribute, false, "the popover attribute still forces display:none");
  assert.equal(payload.popoverFallback.visible, true, "the fallback capsule has no layout box");

  for (const result of payload.results) {
    assert.equal(result.popoverOpen, true, `${result.name}: recovery popover is not in the top layer`);
    assert.equal(result.topLayerHit, true, `${result.name}: recovery is covered by the hostile layer`);
    assert.equal(result.hostileCovered, false, `${result.name}: the hostile layer received the hit test`);
    assert.equal(result.visible, true, `${result.name}: recovery is visually hidden or non-interactive`);
    assert.equal(result.clicked, true, `${result.name}: clicking "use built-in skin" did not reach the handler`);
    assert.equal(result.layerOutsideSkinRoot, true, `${result.name}: recovery was rendered inside .ws-skin-root`);
  }
});

test("a declared slot docks the capsule and falls back at runtime", { skip: !CHROME && "google-chrome is not installed" }, async (t) => {
  const server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, ws: false },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  const port = address && typeof address === "object" ? address.port : 0;
  assert.ok(port, "Vite did not expose a listening port");

  const dom = await dumpDom(`http://127.0.0.1:${port}/test/fixtures/host-slot-placement.html`);
  const match = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "the fixture did not emit a result block");
  const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  assert.equal(payload.error, undefined, payload.error);
  const byName = Object.fromEntries(payload.results.map((result) => [result.name, result]));

  const initial = byName.initial;
  assert.equal(initial.mode, "slotted", JSON.stringify(payload));
  assert.equal(initial.insideAnchor, true, "the capsule is not placed over the anchor");
  assert.equal(initial.hitIsLayerHost, true, "the docked capsule is not the hit-test target");
  assert.equal(initial.background, "rgb(16, 32, 48)", "skin background token was not applied");
  assert.equal(initial.color, "rgb(255, 255, 255)", "skin foreground token was not applied");
  assert.ok(initial.buttonHeight >= 36, "the large size tier minimum was not enforced");

  for (const position of ["middle-left", "middle-right", "top-center", "bottom-center"]) {
    const fallback = byName[`fallback-${position}`];
    assert.equal(fallback.mode, "floating", JSON.stringify(fallback));
    assert.equal(fallback.translated, true, "floating CSS translation was not restored");
    const docked = byName[`redocked-${position}`];
    assert.equal(docked.mode, "slotted", JSON.stringify(docked));
    assert.equal(docked.insideAnchor, true, JSON.stringify(docked));
    assert.equal(docked.hitIsLayerHost, true, JSON.stringify(docked));
    assert.equal(docked.translate, "none", JSON.stringify(docked));
  }

  assert.equal(byName["anchor-hidden"].mode, "floating");
  assert.equal(byName["anchor-hidden"].reason, "anchor-missing");
  assert.equal(byName["anchor-hidden"].inlineLeft, "");
  assert.equal(byName["anchor-hidden"].atDefaultCorner, true);

  // Anti-flap: one good check after a fallback is not enough to re-dock.
  assert.equal(byName["restored-once"].mode, "floating");
  assert.equal(byName["restored-twice"].mode, "slotted");
  assert.equal(byName["restored-twice"].insideAnchor, true);

  assert.equal(byName["covers-mic"].mode, "floating");
  assert.equal(byName["covers-mic"].reason, "covers-protected");
  assert.equal(byName["covers-mic"].atDefaultCorner, true);

  assert.equal(byName["anchor-offscreen"].mode, "floating");
  // An invisible/off-screen element is never resolved as the anchor at all.
  assert.equal(byName["anchor-offscreen"].reason, "anchor-missing");
  assert.equal(byName["anchor-offscreen"].atDefaultCorner, true);

  assert.equal(byName["ordinary-cover"].mode, "floating");
  assert.equal(byName["ordinary-cover"].reason, "anchor-obscured");
  assert.equal(byName["ordinary-cover"].coverClickable, true);
  assert.equal(byName["cover-removed-once"].mode, "floating");
  assert.equal(byName["cover-removed-twice"].mode, "slotted");
  assert.equal(byName["passive-anchor"].mode, "slotted");
  assert.equal(byName["passive-anchor-covered"].reason, "anchor-obscured");
  assert.equal(byName["passive-anchor-covered"].mode, "floating");
  assert.equal(byName["passive-anchor-restored"].mode, "slotted");

  // Foreground equal to background: the whole colour group reverts.
  assert.equal(byName["unreadable-tokens"].background, "rgb(255, 255, 255)");
  assert.equal(byName["unreadable-tokens"].color, "rgb(49, 82, 79)");

  assert.equal(byName.disposed.inlineLeft, "");
  assert.equal(byName.disposed.atDefaultCorner, true);
  assert.equal(byName.disposed.leftoverAccent, "");
});

test("floating host controls move off skin controls at runtime", { skip: !CHROME && "google-chrome is not installed" }, async (t) => {
  const server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, ws: false },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  const port = address && typeof address === "object" ? address.port : 0;
  assert.ok(port, "Vite did not expose a listening port");

  const dom = await dumpDom(`http://127.0.0.1:${port}/test/fixtures/host-floating-placement.html`, ["--virtual-time-budget=60000", "--window-size=1280,800"]);
  const match = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "the fixture did not emit a result block");
  const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  assert.equal(payload.error, undefined, payload.error);
  const byName = Object.fromEntries(payload.results.map((result) => [result.name, result]));

  // Default corner covers the microphone, bottom-right covers the (disabled)
  // Send button and top-left a server strip: the capsule takes a free spot.
  const first = byName["dock-and-send"];
  assert.deepEqual(first.covered, [], JSON.stringify(payload));
  assert.notEqual(first.position, "bottom-left");
  assert.notEqual(first.position, "bottom-right");
  assert.equal(first.capsuleHit, true, "the moved capsule is not clickable");
  assert.equal(first.compact, false);

  // Settled: repeated re-checks over ~2 s never move it again (no jitter).
  assert.deepEqual(byName.stable.positions, [first.position], JSON.stringify(byName.stable));
  // A full-screen click-away layer is no reason to fold to the mark.
  assert.equal(byName["click-away"].compact, false, JSON.stringify(byName["click-away"]));
  // Two host floating controls never overlap, settle, and neither covers Send.
  const two = byName["two-controls"];
  assert.equal(two.overlap, false, JSON.stringify(two));
  assert.equal(two.capMoves, 1, JSON.stringify(two));
  assert.ok(two.libMoves <= 2, JSON.stringify(two));
  assert.equal(two.sendCovered, false, JSON.stringify(two));
  assert.deepEqual(two.covered, [], JSON.stringify(two));

  // A modal sheet opened by a click: its buttons are freed within one re-check.
  // Controls under the modal backdrop are not reachable anyway and do not count.
  assert.deepEqual(byName["after-click-sheet"].covered.filter((id) => id === "cancel" || id === "enter"), [], JSON.stringify(byName["after-click-sheet"]));
  assert.equal(byName["after-click-sheet"].capsuleHit, true);
  assert.notEqual(byName["after-click-sheet"].position, byName["after-click-sheet"].before, "the capsule did not move off the sheet");

  // Nowhere is free: the capsule folds to its mark but stays clickable.
  assert.equal(byName.wall.compact, true, JSON.stringify(byName.wall));
  assert.equal(byName.wall.capsuleHit, true);

  assert.equal(byName["wall-removed"].compact, false);
  // A screen change re-places the capsule within ~150 ms: back to the free
  // default corner, off the control that appeared under its old spot.
  const screen = byName["screen-change"];
  assert.notEqual(screen.away, "bottom-left", JSON.stringify(screen));
  assert.equal(screen.position, "bottom-left", JSON.stringify(screen));
  assert.equal(screen.exportCovered, false, JSON.stringify(screen));
  // Weighting: plain skin buttons are ordinary even inside the protected app root.
  assert.deepEqual(
    { plain: byName.weights.plain, mic: byName.weights.mic, ghost: byName.weights.ghost, custom: byName.weights.custom },
    { plain: 1, mic: 16, ghost: 0, custom: 1 },
    JSON.stringify(byName.weights),
  );
  // 12 s of a control hopping every 200 ms: at most a handful of moves, then the
  // capsule holds still (moves ≥ 1 s apart, frozen after 6 in 10 s).
  t.diagnostic(`flap ${JSON.stringify(byName.flap)} two ${JSON.stringify(byName["two-controls"])}`);
  assert.ok(byName.flap.moves <= 8, JSON.stringify(byName.flap));
  assert.equal(byName.flap.capsuleHit, true);
  assert.equal(byName.disposed.compact, false);
});

test("floating host controls see through toasts and still step off a control while frozen", { skip: !CHROME && "google-chrome is not installed" }, async (t) => {
  const server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, ws: false },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  const port = address && typeof address === "object" ? address.port : 0;
  assert.ok(port, "Vite did not expose a listening port");

  const dom = await dumpDom(`http://127.0.0.1:${port}/test/fixtures/host-floating-transient.html`, ["--virtual-time-budget=60000", "--window-size=1280,800"]);
  const match = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "the fixture did not emit a result block");
  const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  assert.equal(payload.error, undefined, payload.error);
  const byName = Object.fromEntries(payload.results.map((result) => [result.name, result]));
  t.diagnostic(JSON.stringify(payload.results));

  // open-voice-surface desktop: toasts passing over "Share accompaniment" (or
  // the audio-settings modal) no longer make the default corner look free.
  const toast = byName["toast-transient"];
  assert.notEqual(toast.settled, "bottom-right", JSON.stringify(toast));
  assert.ok(!toast.positions.includes("bottom-right"), JSON.stringify(toast));
  assert.equal(toast.coveredSamples, 0, JSON.stringify(toast));
  assert.equal(toast.finalCovered, false, JSON.stringify(toast));
  // Same screen, modal backdrop over the corner: no return home, so the
  // button is usable the moment the dialog closes.
  assert.ok(!toast.afterModal.positions.includes("bottom-right"), JSON.stringify(toast));
  assert.equal(toast.afterModal.accompanimentCovered, false, JSON.stringify(toast));

  // Parked at the default corner by the flap freeze on top of a control: one
  // escape about 1 s after the freeze (inside the 3 s pin), then still for the rest of it.
  const freeze = byName["freeze-escape"];
  assert.equal(freeze.flapMoves, 6, JSON.stringify(freeze));
  assert.equal(freeze.parkedPosition, "bottom-right", JSON.stringify(freeze));
  assert.equal(freeze.escapes.length, 1, JSON.stringify(freeze));
  assert.notEqual(freeze.escapes[0].position, "bottom-right", JSON.stringify(freeze));
  assert.ok(freeze.escapes[0].afterPinMs < 3000, JSON.stringify(freeze));
  assert.equal(freeze.movesWhileHeld, 0, JSON.stringify(freeze));

  const screen = byName["screen-change-during-freeze"];
  assert.ok(screen.sinceFreezeMs < 10000, "the test must switch screens before the old freeze expires");
  assert.equal(screen.coveredBeforeScreenChange, true, JSON.stringify(screen));
  assert.notEqual(screen.position, screen.frozenPosition, JSON.stringify(screen));
  assert.equal(screen.microphoneCovered, false, JSON.stringify(screen));
});

test("compiled quoted keyword animations still run in the browser", { skip: !CHROME && "google-chrome is not installed" }, async () => {
  const raw = '@keyframes linear { from { opacity: .5; } to { opacity: 1; } } [data-ws-part="home.feature"] { animation: "linear" 10s ease-in-out infinite; }';
  const compiled = compileSkinCss(raw, "community.animation-fixture", {}, 3).css;
  const html = `<!doctype html><html><head><style id="css"></style></head><body>
    <div class="ws-skin-root" data-ws-skin="community.animation-fixture"><div data-ws-part="home.feature">Feature</div></div>
    <pre id="result"></pre><script>
    const target = document.querySelector('[data-ws-part="home.feature"]');
    const style = document.getElementById('css');
    style.textContent = ${JSON.stringify(raw)};
    const before = target.getAnimations().length;
    style.textContent = ${JSON.stringify(compiled)};
    document.getElementById('result').textContent = JSON.stringify({ before, after: target.getAnimations().length });
    </script></body></html>`;
  const dom = await dumpDom(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
  const match = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "the animation fixture did not emit a result block");
  const payload = JSON.parse(match[1]);
  assert.equal(payload.before, 1, JSON.stringify(payload));
  assert.equal(payload.after, 1, JSON.stringify(payload));
});

test("host control tokens follow late skin CSS, resolve modern colours and refuse skin fonts", { skip: !CHROME && "google-chrome is not installed" }, async (t) => {
  const server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, ws: false },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  const port = address && typeof address === "object" ? address.port : 0;
  assert.ok(port, "Vite did not expose a listening port");

  // The fixture awaits animation frames, so give headless Chrome virtual time.
  const dom = await dumpDom(`http://127.0.0.1:${port}/test/fixtures/host-control-theme.html`, ["--virtual-time-budget=10000"]);
  const match = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "the fixture did not emit a result block");
  const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  assert.equal(payload.error, undefined, payload.error);
  const byName = Object.fromEntries(payload.results.map((result) => [result.name, result]));

  assert.equal(byName["before-skin-css"].inlineBackground, "", "tokens were applied before the skin declared any");
  const late = byName["late-skin-css"];
  assert.match(late.inlineBackground, /^rgb\(\d+, \d+, \d+\)$/, "late skin CSS did not re-theme the control");
  assert.notEqual(late.inlineBackground, "rgb(255, 251, 235)", "the oklch() background fell back to the default palette");
  assert.equal(late.background, late.inlineBackground);
  assert.equal(late.inlineFont, "ui-sans-serif, system-ui, sans-serif", "a skin @font-face reached a host-owned control");
  assert.equal(byName["system-font"].inlineFont, 'Tahoma, "Segoe UI", sans-serif');
  assert.equal(byName["media-gated-skin-font"].inlineFont, "ui-sans-serif, system-ui, sans-serif", "a media-gated skin @font-face reached a host-owned control");
  const resized = byName["media-token-resize"];
  assert.equal(resized.beforeResize, "rgb(16, 32, 48)", "an @media token was not applied");
  assert.notEqual(resized.inlineBackground, resized.beforeResize, "a viewport change did not refresh @media tokens");
  assert.equal(byName["after-dispose"].inlineBackground, late.inlineBackground, "a disposed binding kept observing the document");
});
