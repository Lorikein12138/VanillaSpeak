import layoutRuntimeCss from "../skins/layout-runtime.css?inline";
import {
  canEditSkinLayoutComponent,
  getSkinLayoutComponentId,
  getSkinLayoutComponent,
  type SkinLayoutDocument,
  type SkinLayoutPage,
  type SkinLayoutPlacement,
  type SkinLayoutProfile,
} from "../../../src/shared/skin-layout.js";
const STYLE_ID = "webspeak-layout-runtime";
const MOBILE_QUERY = "(max-width: 740px)";
const TABLET_QUERY = "(min-width: 741px) and (max-width: 1100px)";

export interface ActiveSkinLayoutContext {
  root: HTMLElement;
  skinId: string;
  page: SkinLayoutPage;
  profile: SkinLayoutProfile;
}

let activePackageSkinId: string | null = null;
let activePackageLayout: SkinLayoutDocument | null = null;
let observer: MutationObserver | null = null;
let refreshFrame = 0;

function isLayoutPage(value: string | undefined): value is SkinLayoutPage {
  return value === "home" || value === "voice" || value === "demo";
}

function currentProfile(): SkinLayoutProfile {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia(MOBILE_QUERY).matches) return "mobile";
  return window.matchMedia(TABLET_QUERY).matches ? "tablet" : "desktop";
}

function activeRoots(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll<HTMLElement>(".ws-skin-root[data-ws-page]")];
}

export function getActiveSkinLayoutContext(): ActiveSkinLayoutContext | null {
  const root = activeRoots()[0];
  if (!root || !isLayoutPage(root.dataset.wsPage)) return null;
  return {
    root,
    skinId: root.dataset.wsSkin || activePackageSkinId || "builtin.light",
    page: root.dataset.wsPage,
    profile: currentProfile(),
  };
}

function effectivePlacements(context: ActiveSkinLayoutContext): Record<string, SkinLayoutPlacement> {
  const packageEntries = activePackageSkinId === context.skinId
    ? activePackageLayout?.pages[context.page]?.[context.profile] ?? {}
    : {};
  return packageEntries;
}

function setVariable(element: HTMLElement, dataFlag: string, variable: string, value: string | undefined): void {
  if (value === undefined) {
    delete element.dataset[dataFlag];
    element.style.removeProperty(variable);
  } else {
    element.dataset[dataFlag] = "true";
    element.style.setProperty(variable, value);
  }
}

function clearLayoutAttributes(element: HTMLElement): void {
  for (const key of ["wsLayoutActive", "wsLayoutHidden", "wsLayoutSelected", "wsLayoutForeground", "wsLayoutBackground", "wsLayoutBorder", "wsLayoutRadius", "wsLayoutWidth", "wsLayoutHeight", "wsLayoutOrder", "wsLayoutTouchTarget"]) {
    delete element.dataset[key];
  }
  for (const key of ["--ws-layout-x", "--ws-layout-y", "--ws-layout-scale", "--ws-layout-order", "--ws-layout-width", "--ws-layout-height", "--ws-layout-foreground", "--ws-layout-background", "--ws-layout-border", "--ws-layout-radius"]) {
    element.style.removeProperty(key);
  }
}

function componentId(element: HTMLElement): string | null {
  return getSkinLayoutComponentId(element.dataset.wsPart, element.dataset.wsControlKind);
}

function trustedAncestorIds(element: HTMLElement, root: HTMLElement): string[] {
  const ids: string[] = [];
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== root) {
    const id = componentId(ancestor);
    if (id) ids.push(id);
    ancestor = ancestor.parentElement;
  }
  return ids;
}

function applyRoot(root: HTMLElement): void {
  const pageValue = root.dataset.wsPage;
  if (!isLayoutPage(pageValue)) return;
  const skinId = root.dataset.wsSkin || activePackageSkinId || "builtin.light";
  const context: ActiveSkinLayoutContext = { root, skinId, page: pageValue, profile: currentProfile() };
  const placements = effectivePlacements(context);
  const nodes = [
    ...(root.matches("[data-ws-part]") ? [root] : []),
    ...root.querySelectorAll<HTMLElement>("[data-ws-part]"),
  ];
  for (const element of nodes) {
    const id = componentId(element);
    const component = id ? getSkinLayoutComponent(id, context.page) : undefined;
    if (!component || !canEditSkinLayoutComponent(id!, context.page, trustedAncestorIds(element, root))) {
      clearLayoutAttributes(element);
      continue;
    }
    const placement = placements[id!];
    if (!placement || !Object.keys(placement).length) {
      clearLayoutAttributes(element);
      continue;
    }
    element.dataset.wsLayoutActive = "true";
    if (placement.visible === false) element.dataset.wsLayoutHidden = "true";
    else delete element.dataset.wsLayoutHidden;
    if (placement.x !== undefined) element.style.setProperty("--ws-layout-x", placement.x + "px");
    else element.style.removeProperty("--ws-layout-x");
    if (placement.y !== undefined) element.style.setProperty("--ws-layout-y", placement.y + "px");
    else element.style.removeProperty("--ws-layout-y");
    if (placement.scale !== undefined) element.style.setProperty("--ws-layout-scale", String(placement.scale));
    else element.style.removeProperty("--ws-layout-scale");
    setVariable(element, "wsLayoutOrder", "--ws-layout-order", placement.order === undefined ? undefined : String(placement.order));
    setVariable(element, "wsLayoutWidth", "--ws-layout-width", placement.width === undefined ? undefined : placement.width + "px");
    setVariable(element, "wsLayoutHeight", "--ws-layout-height", placement.height === undefined ? undefined : placement.height + "px");
    setVariable(element, "wsLayoutForeground", "--ws-layout-foreground", placement.foreground);
    setVariable(element, "wsLayoutBackground", "--ws-layout-background", placement.background);
    setVariable(element, "wsLayoutBorder", "--ws-layout-border", placement.border);
    setVariable(element, "wsLayoutRadius", "--ws-layout-radius", placement.radius === undefined ? undefined : placement.radius + "px");
  }
}

export function refreshSkinLayout(): void {
  if (typeof document === "undefined") return;
  for (const root of activeRoots()) applyRoot(root);
}

function scheduleRefresh(): void {
  if (typeof window === "undefined" || refreshFrame) return;
  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = 0;
    refreshSkinLayout();
  });
}

export function initializeSkinLayoutRuntime(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = layoutRuntimeCss;
    document.head.append(style);
  }
  if (!observer) {
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-ws-page", "data-ws-skin", "data-ws-part", "data-ws-control-kind"],
    });
    window.addEventListener("resize", scheduleRefresh, { passive: true });
  }
  scheduleRefresh();
}

export function setSkinLayoutPackage(skinId: string, layout: SkinLayoutDocument | null): void {
  activePackageSkinId = skinId;
  activePackageLayout = layout;
  if (layout) initializeSkinLayoutRuntime();
  refreshSkinLayout();
}
