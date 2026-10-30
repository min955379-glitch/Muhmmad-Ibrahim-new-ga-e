/**
 * Versioned, Checksummed, Migratable Save System (SaveV3)
 * - FNV-1a 32-bit checksum over canonical JSON payload
 * - Keeps 2 rolling snapshots for automatic corruption recovery
 * - Enforces < 300 KB save budget
 * - Supports v1 -> v2 -> v3 schema migration without data wipe
 */

import { playablesSDK } from './shim-playables';

export type UpgradeTrack =
  | 'playerSpeed'
  | 'carryCapacity'
  | 'checkoutSpeed'
  | 'marketing'
  | 'shelfCapacity'
  | 'machineSpeed'
  | 'animalOutput'
  | 'cropYield'
  | 'staffSpeed'
  | 'staffCapacity'
  | 'cashMagnet'
  | 'patience'
  | 'smartShelf'
  | 'autoHire';

export type StaffRole = 'cashier' | 'stocker' | 'farmer' | 'chef' | 'barista' | 'guard';

export type GraphicsPreset = 'low' | 'balanced' | 'high' | 'ultra';
export type ColorBlindMode = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
export type LocaleCode = 'en' | 'es' | 'pt-BR' | 'id' | 'hi' | 'ur' | 'ja' | 'ko' | 'tr' | 'de' | 'fr';

export interface SavedStaff {
  id: string;
  name: string;
  role: StaffRole;
  tier: 1 | 2 | 3;
  martIndex: number;
  levels: {
    speed: number;
    carry: number;
    efficiency: number;
    stamina: number;
  };
  personality: [number, number, number]; // [diligence, chattiness, tidiness]
}

export interface SavedMartState {
  unlockedPlots: string[];
  revenueEarned: number;
  customersServed: number;
  angryExits: number;
  elapsedSeconds: number;
  shelfStocks: Record<string, number>;
  machineStocks: Record<string, { input: number; output: number; jammed: boolean }>;
  cashOnCounters: Record<string, number>;
  tutorialStep?: number;
}

export interface AccessibilitySettings {
  fontScale: number; // 0.8 to 1.6
  reduceMotion: boolean;
  colorBlindMode: ColorBlindMode;
  highContrast: boolean;
  oneSwitchScan: boolean;
  subtitles: boolean;
  screenReaderAnnouncements: boolean;
  assistPatienceBonus: boolean; // +50% patience
  assistIncomeBonus: boolean; // +25% income
  assistNoThief: boolean; // disables thief
}

export interface AudioBusSettings {
  masterMuted: boolean;
  sfx: number;
  asmr: number;
  music: number;
  ui: number;
}

export interface AutoHireToggles {
  autoAssign: boolean;
  autoUpgradeCheapest: boolean;
}

export interface SaveV3 {
  schema: 3;
  seed: number;
  createdAt: number;
  savedAt: number;
  progress: {
    martIndex: number;
    stars: Record<number, 0 | 1 | 2 | 3>;
    prestige: number;
    activeModifier: string | null;
  };
  wallets: {
    cash: number;
    gems?: 0;
  };
  upgrades: Record<UpgradeTrack, number>;
  staff: SavedStaff[];
  marts: Record<number, SavedMartState>;
  autoHire: AutoHireToggles;
  settings: {
    audio: AudioBusSettings;
    graphics: GraphicsPreset;
    haptics: boolean;
    a11y: AccessibilitySettings;
    locale: LocaleCode;
  };
  checksum: string;
}

const PRIMARY_KEY = 'minimart_evolved_save_v3';
const SNAPSHOT_1_KEY = 'minimart_evolved_save_snap1';
const SNAPSHOT_2_KEY = 'minimart_evolved_save_snap2';
const UNKNOWN_BACKUP_KEY = 'minimart_evolved_save_unknown_backup';

/** Deterministic FNV-1a 32-bit hash */
export function computeFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Canonical JSON stringify with sorted object keys for deterministic hashing */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalStringify(item)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    if (obj[k] === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  }
  return '{' + parts.join(',') + '}';
}

export function computeSaveChecksum(saveWithoutChecksum: Omit<SaveV3, 'checksum'>): string {
  return computeFNV1a(canonicalStringify(saveWithoutChecksum));
}

export function createDefaultSave(seed = 0x5eed2026): SaveV3 {
  const now = Date.now();
  const base: Omit<SaveV3, 'checksum'> = {
    schema: 3,
    seed,
    createdAt: now,
    savedAt: now,
    progress: {
      martIndex: 1,
      stars: { 1: 0 },
      prestige: 0,
      activeModifier: null,
    },
    wallets: {
      cash: 85, // Welcoming starter capital so early plot/produce flows smoothly
      gems: 0,
    },
    upgrades: {
      playerSpeed: 0,
      carryCapacity: 0,
      checkoutSpeed: 0,
      marketing: 0,
      shelfCapacity: 0,
      machineSpeed: 0,
      animalOutput: 0,
      cropYield: 0,
      staffSpeed: 0,
      staffCapacity: 0,
      cashMagnet: 0,
      patience: 0,
      smartShelf: 0,
      autoHire: 0,
    },
    staff: [],
    marts: {
      1: {
        unlockedPlots: ['crop_tomato_1', 'shelf_tomato_1', 'till_1'],
        revenueEarned: 0,
        customersServed: 0,
        angryExits: 0,
        elapsedSeconds: 0,
        shelfStocks: { shelf_tomato_1: 2 },
        machineStocks: {},
        cashOnCounters: {},
        tutorialStep: 0,
      },
    },
    autoHire: {
      autoAssign: true,
      autoUpgradeCheapest: false,
    },
    settings: {
      audio: {
        masterMuted: false,
        sfx: 0.85,
        asmr: 0.9,
        music: 0.65,
        ui: 0.8,
      },
      graphics: 'high',
      haptics: true,
      a11y: {
        fontScale: 1.0,
        reduceMotion: false,
        colorBlindMode: 'none',
        highContrast: false,
        oneSwitchScan: false,
        subtitles: false,
        screenReaderAnnouncements: true,
        assistPatienceBonus: false,
        assistIncomeBonus: false,
        assistNoThief: false,
      },
      locale: 'en',
    },
  };
  return {
    ...base,
    checksum: computeSaveChecksum(base),
  };
}

/** Migrate v1 -> v2 -> v3 saves safely */
export function migrateSave(rawObj: any): SaveV3 | null {
  if (!rawObj || typeof rawObj !== 'object') return null;

  let current = { ...rawObj };

  if (current.schema === 1) {
    current = {
      ...current,
      schema: 2,
      autoHire: { autoAssign: true, autoUpgradeCheapest: false },
    };
  }

  if (current.schema === 2) {
    const def = createDefaultSave(current.seed ?? 0x5eed2026);
    current = {
      ...def,
      ...current,
      schema: 3,
      settings: {
        ...def.settings,
        ...(current.settings ?? {}),
        a11y: {
          ...def.settings.a11y,
          ...(current.settings?.a11y ?? {}),
        },
      },
    };
    const { checksum: _old, ...withoutChecksum } = current;
    current.checksum = computeSaveChecksum(withoutChecksum);
  }

  if (current.schema !== 3) {
    return null;
  }

  const { checksum, ...body } = current as SaveV3;
  const expected = computeSaveChecksum(body);
  if (checksum !== expected) {
    return null;
  }
  return current as SaveV3;
}

export interface LoadResult {
  save: SaveV3;
  recoveredFromSnapshot: boolean;
  offlineSeconds: number;
  offlineEarnings: number;
}

export function serializeSave(save: SaveV3): string {
  const { checksum: _ignore, ...body } = save;
  const updated: SaveV3 = {
    ...body,
    checksum: computeSaveChecksum(body),
  };
  return JSON.stringify(updated);
}

export function parseAndVerifySave(rawJson: string | null): SaveV3 | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed.schema === 'number' && parsed.schema > 3) {
      // Unknown newer schema: preserve backup without deleting
      try {
        localStorage.setItem(UNKNOWN_BACKUP_KEY, rawJson);
      } catch {
        // ignore
      }
      return null;
    }
    return migrateSave(parsed);
  } catch {
    return null;
  }
}

export function persistSave(save: SaveV3): { ok: boolean; byteLength: number } {
  save.savedAt = Date.now();
  const serialized = serializeSave(save);
  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > 300 * 1024) {
    return { ok: false, byteLength };
  }

  try {
    const prevPrimary = localStorage.getItem(PRIMARY_KEY);
    const prevSnap1 = localStorage.getItem(SNAPSHOT_1_KEY);
    if (prevSnap1) {
      localStorage.setItem(SNAPSHOT_2_KEY, prevSnap1);
    }
    if (prevPrimary) {
      // Only rotate valid primary to snap1
      if (parseAndVerifySave(prevPrimary)) {
        localStorage.setItem(SNAPSHOT_1_KEY, prevPrimary);
      }
    }
    localStorage.setItem(PRIMARY_KEY, serialized);
  } catch {
    // localStorage disabled
  }

  void playablesSDK.saveData(serialized);
  return { ok: true, byteLength };
}

export async function loadSaveWithRecovery(): Promise<LoadResult> {
  // 1. Try Playables Cloud
  const cloudRaw = await playablesSDK.loadData();
  const cloudSave = parseAndVerifySave(cloudRaw);

  // 2. Try LocalStorage Primary
  let localPrimaryRaw: string | null = null;
  try {
    localPrimaryRaw = localStorage.getItem(PRIMARY_KEY);
  } catch {
    localPrimaryRaw = null;
  }
  const localSave = parseAndVerifySave(localPrimaryRaw);

  let chosen: SaveV3 | null = null;
  let recoveredFromSnapshot = false;

  if (cloudSave && localSave) {
    chosen = cloudSave.savedAt >= localSave.savedAt ? cloudSave : localSave;
  } else {
    chosen = localSave ?? cloudSave;
  }

  // If primary existed & was corrupted, recover from Snapshot 1 or Snapshot 2
  if (!chosen && localPrimaryRaw) {
    const snap1 = parseAndVerifySave(localStorage.getItem(SNAPSHOT_1_KEY));
    const snap2 = parseAndVerifySave(localStorage.getItem(SNAPSHOT_2_KEY));
    chosen = snap1 ?? snap2;
    if (chosen) {
      recoveredFromSnapshot = true;
      persistSave(chosen);
    }
  }

  if (!chosen) {
    chosen = createDefaultSave();
    persistSave(chosen);
    return {
      save: chosen,
      recoveredFromSnapshot: false,
      offlineSeconds: 0,
      offlineEarnings: 0,
    };
  }

  // Calculate offline earnings capped at 4 hours (§7.11)
  const now = Date.now();
  const rawElapsedSec = Math.max(0, Math.floor((now - chosen.savedAt) / 1000));
  const cappedOfflineSec = Math.min(4 * 3600, rawElapsedSec);
  let offlineEarnings = 0;

  if (cappedOfflineSec >= 30 && chosen.staff.length > 0) {
    const effectiveRatePerSec = Math.max(1.5, chosen.staff.length * 1.8 * (1 + 0.08 * chosen.progress.martIndex));
    offlineEarnings = Math.floor(effectiveRatePerSec * cappedOfflineSec * 0.35);
  }

  return {
    save: chosen,
    recoveredFromSnapshot,
    offlineSeconds: cappedOfflineSec,
    offlineEarnings,
  };
}

export function corruptPrimarySaveForTesting(): void {
  const current = localStorage.getItem(PRIMARY_KEY);
  if (current) {
    const corrupted = current.replace(/"checksum":"[0-9a-f]+"/, '"checksum":"deadbeef"');
    localStorage.setItem(PRIMARY_KEY, corrupted);
  }
}
