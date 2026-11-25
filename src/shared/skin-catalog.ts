export interface SkinCatalogEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  license: string;
  description?: string;
  minAppVersion: string;
  previewUrl?: string;
  previewMimeType?: string;
  installedAt: number;
  builtIn?: boolean;
  enabled?: boolean;
  previewKind?: "day" | "night";
}


export const BUILTIN_SKIN_IDS = ["builtin.light", "builtin.dark"] as const;
export const RETIRED_KAAK_ID = "community.kaak-voice";

export const BUILTIN_SKIN_CATALOG: SkinCatalogEntry[] = [
  {
    id: "builtin.light",
    name: "Day mode",
    version: "1.1.0",
    author: "VanillaSpeak",
    license: "AGPL-3.0-only",
    description: "The default light appearance.",
    minAppVersion: "0.2.6",
    installedAt: 0,
    builtIn: true,
    previewKind: "day",
  },
  {
    id: "builtin.dark",
    name: "Night mode",
    version: "1.1.0",
    author: "VanillaSpeak",
    license: "AGPL-3.0-only",
    description: "The default dark appearance.",
    minAppVersion: "0.2.6",
    installedAt: 0,
    builtIn: true,
    previewKind: "night",
  },
];

