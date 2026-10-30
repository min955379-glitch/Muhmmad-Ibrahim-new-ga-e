/**
 * Economy Formulas, 14 Upgrade Tracks, and 6 Staff Classes × 3 Tiers (§8.3, §8.4, §8.5)
 */

import { StaffRole, UpgradeTrack } from '../core/save';

export interface UpgradeTrackDef {
  id: UpgradeTrack;
  name: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  effectSummary: string;
  formatValue: (level: number) => string;
}

export const UPGRADE_TRACKS: readonly UpgradeTrackDef[] = [
  {
    id: 'playerSpeed',
    name: 'Player Speed',
    baseCost: 120,
    growth: 1.28,
    maxLevel: 12,
    effectSummary: '+6% move speed per level',
    formatValue: (lvl) => `${Math.min(2.4, +(1 + 0.06 * lvl).toFixed(2))}×`,
  },
  {
    id: 'carryCapacity',
    name: 'Carry Capacity',
    baseCost: 180,
    growth: 1.30,
    maxLevel: 12,
    effectSummary: '+2 carry slots per level',
    formatValue: (lvl) => `${4 + lvl * 2} items`,
  },
  {
    id: 'checkoutSpeed',
    name: 'Checkout Speed',
    baseCost: 200,
    growth: 1.32,
    maxLevel: 12,
    effectSummary: '−0.03s serve time per level',
    formatValue: (lvl) => `${Math.max(0.35, +(1.1 - 0.03 * lvl).toFixed(2))}s`,
  },
  {
    id: 'marketing',
    name: 'Walk-in Marketing',
    baseCost: 260,
    growth: 1.34,
    maxLevel: 12,
    effectSummary: '+7% customer arrival rate',
    formatValue: (lvl) => `+${lvl * 7}%`,
  },
  {
    id: 'shelfCapacity',
    name: 'Shelf Capacity',
    baseCost: 240,
    growth: 1.30,
    maxLevel: 12,
    effectSummary: '+2 items per shelf slot',
    formatValue: (lvl) => `${6 + lvl * 2}/slot`,
  },
  {
    id: 'machineSpeed',
    name: 'Machine Throughput',
    baseCost: 320,
    growth: 1.30,
    maxLevel: 12,
    effectSummary: '−5% machine process time',
    formatValue: (lvl) => `−${lvl * 5}%`,
  },
  {
    id: 'animalOutput',
    name: 'Animal Output',
    baseCost: 300,
    growth: 1.32,
    maxLevel: 12,
    effectSummary: '+8% animal yield bonus',
    formatValue: (lvl) => `+${lvl * 8}%`,
  },
  {
    id: 'cropYield',
    name: 'Crop Yield & Irrigation',
    baseCost: 300,
    growth: 1.32,
    maxLevel: 12,
    effectSummary: '+8% harvest yield & auto-water',
    formatValue: (lvl) => `+${lvl * 8}%`,
  },
  {
    id: 'staffSpeed',
    name: 'Staff Move Speed',
    baseCost: 280,
    growth: 1.28,
    maxLevel: 12,
    effectSummary: '+6% crew walk speed',
    formatValue: (lvl) => `+${lvl * 6}%`,
  },
  {
    id: 'staffCapacity',
    name: 'Staff Carry Stack',
    baseCost: 300,
    growth: 1.30,
    maxLevel: 12,
    effectSummary: '+1 staff carry slot per level',
    formatValue: (lvl) => `${3 + lvl} slots`,
  },
  {
    id: 'cashMagnet',
    name: 'Cash Magnet',
    baseCost: 160,
    growth: 1.26,
    maxLevel: 12,
    effectSummary: '+0.3m magnetic pickup radius',
    formatValue: (lvl) => `${(1.1 + lvl * 0.3).toFixed(1)}m`,
  },
  {
    id: 'patience',
    name: 'Customer Comfort',
    baseCost: 220,
    growth: 1.30,
    maxLevel: 12,
    effectSummary: '+4s customer patience',
    formatValue: (lvl) => `${18 + lvl * 4}s`,
  },
  {
    id: 'smartShelf',
    name: 'Smart Shelf Sensors',
    baseCost: 420,
    growth: 1.36,
    maxLevel: 12,
    effectSummary: 'Proactive restock trigger threshold',
    formatValue: (lvl) => `${Math.min(75, 25 + lvl * 4)}%`,
  },
  {
    id: 'autoHire',
    name: 'Clipboard Bot Assistant',
    baseCost: 500,
    growth: 1.40,
    maxLevel: 12,
    effectSummary: 'Unlocks & speeds up Auto-Hire Bot',
    formatValue: (lvl) => (lvl === 0 ? 'Locked' : `Tier ${lvl}`),
  },
];

export const UPGRADE_MAP = new Map<UpgradeTrack, UpgradeTrackDef>(
  UPGRADE_TRACKS.map((u) => [u.id, u]),
);

export interface StaffClassDef {
  role: StaffRole;
  title: string;
  baseHire: number;
  baseWagePerMin: number;
  capabilitySummary: string;
  uniformColor: number;
  hatType: 'visor' | 'backwardsCap' | 'strawHat' | 'toque' | 'beret' | 'peakedCap';
  propType: 'scanner' | 'crate' | 'wateringCan' | 'rollingPin' | 'milkJug' | 'flashlight';
}

export const STAFF_CLASSES: readonly StaffClassDef[] = [
  {
    role: 'cashier',
    title: 'Cashier',
    baseHire: 90,
    baseWagePerMin: 6,
    capabilitySummary: 'Serves checkout queues rapidly',
    uniformColor: 0x2e9e9b,
    hatType: 'visor',
    propType: 'scanner',
  },
  {
    role: 'stocker',
    title: 'Stocker',
    baseHire: 90,
    baseWagePerMin: 6,
    capabilitySummary: 'Restocks shelves from crops, animals & machines',
    uniformColor: 0xffc65c,
    hatType: 'backwardsCap',
    propType: 'crate',
  },
  {
    role: 'farmer',
    title: 'Farmer',
    baseHire: 110,
    baseWagePerMin: 7,
    capabilitySummary: 'Harvests crops, feeds animals & gathers eggs/milk',
    uniformColor: 0x4fa85c,
    hatType: 'strawHat',
    propType: 'wateringCan',
  },
  {
    role: 'chef',
    title: 'Chef',
    baseHire: 150,
    baseWagePerMin: 9,
    capabilitySummary: 'Loads processing machines & clears jams',
    uniformColor: 0xe8503a,
    hatType: 'toque',
    propType: 'rollingPin',
  },
  {
    role: 'barista',
    title: 'Barista',
    baseHire: 170,
    baseWagePerMin: 10,
    capabilitySummary: 'Runs beverage machines & express counters',
    uniformColor: 0x8e5bc9,
    hatType: 'beret',
    propType: 'milkJug',
  },
  {
    role: 'guard',
    title: 'Security Guard',
    baseHire: 220,
    baseWagePerMin: 12,
    capabilitySummary: 'Intercepts thieves automatically & +8% patience aura',
    uniformColor: 0x23324a,
    hatType: 'peakedCap',
    propType: 'flashlight',
  },
];

export const STAFF_CLASS_MAP = new Map<StaffRole, StaffClassDef>(
  STAFF_CLASSES.map((s) => [s.role, s]),
);

/**
 * Verbatim Economy Formulas (§8.3)
 */
export function computeSalePrice(
  baseValue: number,
  martIndex: number,
  productUpgradeLevel = 0,
  prestigeLoops = 0,
  incomeAssist = false,
): number {
  const raw =
    baseValue *
    (1 + 0.045 * martIndex) *
    (1 + 0.02 * productUpgradeLevel) *
    Math.pow(1.12, prestigeLoops) *
    (incomeAssist ? 1.25 : 1.0);
  return Math.max(1, Math.round(raw));
}

export function computeUpgradeCost(track: UpgradeTrack, currentLevel: number): number {
  const def = UPGRADE_MAP.get(track);
  if (!def) return 999999;
  return Math.ceil(def.baseCost * Math.pow(def.growth, currentLevel));
}

export function computeHireCost(role: StaffRole, currentCountOfRole: number): number {
  const def = STAFF_CLASS_MAP.get(role);
  if (!def) return 999;
  const n = Math.max(1, currentCountOfRole + 1);
  return Math.ceil(def.baseHire * Math.pow(1.55, n - 1));
}

export function computeWagePerMin(role: StaffRole, tier: 1 | 2 | 3): number {
  const def = STAFF_CLASS_MAP.get(role);
  if (!def) return 6;
  return Math.round(def.baseWagePerMin * (1 + 0.8 * (tier - 1)));
}

export const STAFF_NAMES: readonly string[] = [
  'Mia', 'Sam', 'Leo', 'Zoe', 'Kai', 'Nia', 'Eli', 'Ava', 'Max', 'Ivy',
  'Rio', 'Luz', 'Taj', 'Mei', 'Noa', 'Sol', 'Jay', 'Uma', 'Ben', 'Gia',
];
