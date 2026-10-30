/**
 * Deterministic 60 Hz Store Simulation World (§6.2, §7)
 * NOTE: Zero imports from render/ or ui/. Publishes events via EventBus.
 */

import { EventBus } from '../core/events';
import { SeededRNG } from '../core/rng';
import {
  SaveV3,
  StaffRole,
  UpgradeTrack,
  persistSave,
} from '../core/save';
import { getMachineDef } from '../content/machines';
import {
  MartDef,
  PRESTIGE_MODIFIERS,
  StationBlueprint,
  getMartDef,
} from '../content/marts';
import { getProduct } from '../content/products';
import {
  STAFF_NAMES,
  UPGRADE_MAP,
  computeHireCost,
  computeSalePrice,
  computeUpgradeCost,
} from '../content/upgrades';
import {
  JobBroker,
  SimJob,
  StaffBidder,
  executeBatchPickupNoWait,
} from './jobs';
import { AgentSpatialEntry, NavSystem, ObstacleBox } from './nav';

export interface CropStationState {
  id: string;
  blueprint: StationBlueprint;
  unlocked: boolean;
  productId: string;
  growthProgress: number; // 0..1 (4 stages: <0.25 sprout, <0.5 leaf, <0.85 flower, >=1.0 ripe)
  ripeTimer: number; // tracks overripe > 3x growthTime
  availableUnits: number;
  maxUnits: number;
}

export interface AnimalStationState {
  id: string;
  blueprint: StationBlueprint;
  unlocked: boolean;
  animalType: 'hen' | 'cow';
  productId: string;
  feedProductId: string;
  feedStock: number;
  maxFeed: number;
  produceTimer: number;
  availableOutput: number;
  maxOutput: number;
  continuousFedSeconds: number;
  welfareBuffActive: boolean; // +15% output when fed >= 60s (§7.7)
}

export interface MachineStationState {
  id: string;
  blueprint: StationBlueprint;
  unlocked: boolean;
  machineId: string;
  inputProducts: string[];
  outputProduct: string;
  inputCounts: Record<string, number>;
  maxQueue: number;
  state: 'IDLE' | 'WAITING_INPUT' | 'PROCESSING' | 'OUTPUT_READY' | 'BLOCKED_OUTPUT';
  progress: number; // 0..1
  processTime: number;
  outputCount: number;
  uncollectedOutputSeconds: number;
  jammed: boolean;
  repairProgress: number;
}

export interface ShelfStationState {
  id: string;
  blueprint: StationBlueprint;
  unlocked: boolean;
  productId: string;
  stock: number;
  capacity: number;
  emptyDurationSeconds: number; // >10s shows worried face on price tag (§12)
}

export interface TillStationState {
  id: string;
  blueprint: StationBlueprint;
  unlocked: boolean;
  cashOnCounter: number;
  cashIdleSeconds: number;
  servingProgress: number;
  queueCustomerIds: string[];
}

export interface HeroAgent {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
  carrying: string[];
  carryCapacity: number;
  moveSpeed: number;
  actionCooldown: number;
  squashImpulse: number;
}

export interface StaffAgent {
  id: string;
  name: string;
  role: StaffRole;
  tier: 1 | 2 | 3;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
  carrying: string[];
  carryCapacity: number;
  moveSpeed: number;
  levels: {
    speed: number;
    carry: number;
    efficiency: number;
    stamina: number;
  };
  personality: [number, number, number];
  currentJobId: string | null;
  currentTaskLabel: string;
  targetX: number;
  targetZ: number;
  lastStationId: string | null;
  actionCooldown: number;
  stuckSeconds: number;
  lastCheckX: number;
  lastCheckZ: number;
  chatBubble: 'coffee' | 'chat' | 'star' | null;
}

export type CustomerArchetype =
  | 'parent_toddler'
  | 'exec_hurried'
  | 'elder_couple'
  | 'courier'
  | 'kid_lollipop'
  | 'tourist_camera'
  | 'jogger'
  | 'chef_foodie'
  | 'student_backpack'
  | 'artist_beret'
  | 'gardener'
  | 'vip_gold';

export const CUSTOMER_ARCHETYPES: readonly CustomerArchetype[] = [
  'parent_toddler',
  'exec_hurried',
  'elder_couple',
  'courier',
  'kid_lollipop',
  'tourist_camera',
  'jogger',
  'chef_foodie',
  'student_backpack',
  'artist_beret',
  'gardener',
  'vip_gold',
];

export interface CustomerAgent {
  id: string;
  archetype: CustomerArchetype;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
  state: 'ENTER' | 'SHOPPING' | 'QUEUE' | 'PAYING' | 'EXIT' | 'IMPATIENT_EXIT' | 'ANGRY_EXIT';
  desiredItems: string[];
  basket: string[];
  targetStationId: string | null;
  targetX: number;
  targetZ: number;
  patience: number;
  maxPatience: number;
  shoppingWaitSeconds: number;
  retargetTimer: number;
  moveSpeed: number;
  shirtColor: number;
}

export interface ThiefAgent {
  active: boolean;
  phase: 'TELEGRAPH' | 'APPROACH' | 'ESCAPE';
  telegraphSecondsLeft: number;
  x: number;
  z: number;
  facingAngle: number;
  targetTillId: string;
  stolenAmount: number;
}

export interface FlowArrowData {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  kind: 'goods' | 'staff' | 'customer';
}

export class SimWorld {
  public readonly rng: SeededRNG;
  public readonly events: EventBus;
  public readonly nav: NavSystem;
  public readonly broker: JobBroker;
  public save: SaveV3;
  public mart: MartDef;

  public simTime = 0;
  public paused = false;
  public timeScale = 1.0;
  public hitStopSeconds = 0;

  public hero: HeroAgent;
  public crops: CropStationState[] = [];
  public animals: AnimalStationState[] = [];
  public machines: MachineStationState[] = [];
  public shelves: ShelfStationState[] = [];
  public tills: TillStationState[] = [];
  public breakRoomPos = { x: 6.2, z: 4.2 };

  public staff: StaffAgent[] = [];
  public customers: CustomerAgent[] = [];
  public thief: ThiefAgent = {
    active: false,
    phase: 'TELEGRAPH',
    telegraphSecondsLeft: 0,
    x: 0,
    z: 6.2,
    facingAngle: Math.PI,
    targetTillId: 'till_1',
    stolenAmount: 0,
  };

  public revenueEarned = 0;
  public customersServed = 0;
  public angryExits = 0;
  public martElapsedSeconds = 0;
  public tutorialStep = 0;

  // Input state
  public inputMoveX = 0;
  public inputMoveZ = 0;
  public pointerTarget: { x: number; z: number } | null = null;

  // Diagnostics & Soak counters (§18)
  public stuckRecoveryCount = 0;
  public customerSeq = 0;
  public purchaseReceiptCount = 0;
  private processedTransactionIds = new Set<string>();
  private brokerTimer = 0;
  private customerSpawnAccumulator = 0;
  private wageTimer = 0;
  private autoSaveTimer = 0;
  private autoHireTimer = 0;
  private spatialScratch: AgentSpatialEntry[] = [];

  constructor(save: SaveV3, events?: EventBus) {
    this.save = save;
    this.rng = new SeededRNG(save.seed);
    this.events = events ?? new EventBus();
    this.nav = new NavSystem();
    this.broker = new JobBroker();
    this.mart = getMartDef(save.progress.martIndex);

    this.hero = {
      x: 0,
      z: 2.2,
      vx: 0,
      vz: 0,
      facingAngle: 0,
      carrying: [],
      carryCapacity: 4,
      moveSpeed: 4.2,
      actionCooldown: 0,
      squashImpulse: 0,
    };

    this.loadMart(save.progress.martIndex);
  }

  public loadMart(martIndex: number): void {
    this.save.progress.martIndex = martIndex;
    this.mart = getMartDef(martIndex);
    this.broker.clear();
    this.customers = [];
    this.crops = [];
    this.animals = [];
    this.machines = [];
    this.shelves = [];
    this.tills = [];
    this.thief.active = false;

    const savedMart = this.save.marts[martIndex] ?? {
      unlockedPlots: this.mart.stations.filter((s) => s.unlockCost === 0).map((s) => s.id),
      revenueEarned: 0,
      customersServed: 0,
      angryExits: 0,
      elapsedSeconds: 0,
      shelfStocks: {},
      machineStocks: {},
      cashOnCounters: {},
      tutorialStep: martIndex === 1 ? 0 : 99,
    };
    this.save.marts[martIndex] = savedMart;

    this.revenueEarned = savedMart.revenueEarned;
    this.customersServed = savedMart.customersServed;
    this.angryExits = savedMart.angryExits;
    this.martElapsedSeconds = savedMart.elapsedSeconds;
    this.tutorialStep = savedMart.tutorialStep ?? (martIndex === 1 ? 0 : 99);

    const unlockedSet = new Set(savedMart.unlockedPlots);
    const obstacles: ObstacleBox[] = [];

    for (const bp of this.mart.stations) {
      const unlocked = bp.unlockCost === 0 || unlockedSet.has(bp.id);

      if (bp.type === 'crop') {
        this.crops.push({
          id: bp.id,
          blueprint: bp,
          unlocked,
          productId: bp.productId ?? 'tomato',
          growthProgress: 1.0,
          ripeTimer: 0,
          availableUnits: unlocked ? 4 : 0,
          maxUnits: 6,
        });
        obstacles.push({ x: bp.x, z: bp.z, halfW: 0.55, halfD: 0.55 });
      } else if (bp.type === 'animal') {
        this.animals.push({
          id: bp.id,
          blueprint: bp,
          unlocked,
          animalType: bp.animalType ?? 'hen',
          productId: bp.productId ?? 'egg',
          feedProductId: bp.feedProductId ?? 'tomato',
          feedStock: unlocked ? 3 : 0,
          maxFeed: 6,
          produceTimer: 0,
          availableOutput: unlocked ? 2 : 0,
          maxOutput: 6,
          continuousFedSeconds: 0,
          welfareBuffActive: false,
        });
        obstacles.push({ x: bp.x, z: bp.z, halfW: 0.65, halfD: 0.55 });
      } else if (bp.type === 'machine') {
        const mDef = getMachineDef(bp.machineId ?? 'blender');
        const savedM = savedMart.machineStocks[bp.id];
        const inputCounts: Record<string, number> = {};
        for (const inp of mDef.inputProducts) {
          inputCounts[inp] = savedM?.input ?? 0;
        }
        this.machines.push({
          id: bp.id,
          blueprint: bp,
          unlocked,
          machineId: mDef.id,
          inputProducts: [...mDef.inputProducts],
          outputProduct: mDef.outputProduct,
          inputCounts,
          maxQueue: mDef.maxQueue,
          state: 'IDLE',
          progress: 0,
          processTime: mDef.processTime,
          outputCount: savedM?.output ?? (unlocked ? 1 : 0),
          uncollectedOutputSeconds: 0,
          jammed: savedM?.jammed ?? false,
          repairProgress: 0,
        });
        obstacles.push({ x: bp.x, z: bp.z, halfW: 0.6, halfD: 0.55 });
      } else if (bp.type === 'shelf') {
        const cap = this.getShelfCapacity();
        this.shelves.push({
          id: bp.id,
          blueprint: bp,
          unlocked,
          productId: bp.productId ?? 'tomato',
          stock: savedMart.shelfStocks[bp.id] ?? (unlocked ? Math.min(4, cap) : 0),
          capacity: cap,
          emptyDurationSeconds: 0,
        });
        obstacles.push({ x: bp.x, z: bp.z, halfW: 0.55, halfD: 0.42 });
      } else if (bp.type === 'till') {
        this.tills.push({
          id: bp.id,
          blueprint: bp,
          unlocked,
          cashOnCounter: savedMart.cashOnCounters[bp.id] ?? 0,
          cashIdleSeconds: 0,
          servingProgress: 0,
          queueCustomerIds: [],
        });
        obstacles.push({ x: bp.x, z: bp.z, halfW: 0.65, halfD: 0.45 });
      } else if (bp.type === 'breakroom') {
        this.breakRoomPos = { x: bp.x, z: bp.z };
      }
    }

    this.nav.rebuildObstacles(obstacles);
    this.hero.x = 0;
    this.hero.z = 2.0;
    this.hero.carrying = [];
    this.syncUpgradesToAgents();
    this.rebuildStaffAgentsForCurrentMart();
  }

  public getShelfCapacity(): number {
    return 6 + (this.save.upgrades.shelfCapacity ?? 0) * 2;
  }

  public syncUpgradesToAgents(): void {
    const speedLvl = this.save.upgrades.playerSpeed ?? 0;
    const carryLvl = this.save.upgrades.carryCapacity ?? 0;
    this.hero.moveSpeed = Math.min(2.4 * 4.2, 4.2 * (1 + 0.06 * speedLvl));
    this.hero.carryCapacity = 4 + carryLvl * 2;

    const shelfCap = this.getShelfCapacity();
    for (const s of this.shelves) {
      s.capacity = shelfCap;
    }

    const globalStaffSpeed = this.save.upgrades.staffSpeed ?? 0;
    const globalStaffCap = this.save.upgrades.staffCapacity ?? 0;
    for (const st of this.staff) {
      st.moveSpeed =
        3.5 *
        (1 + 0.06 * globalStaffSpeed) *
        (1 + 0.05 * st.levels.speed) *
        (1 + 0.1 * (st.tier - 1));
      st.carryCapacity = 3 + globalStaffCap + st.levels.carry + (st.tier - 1) * 2;
    }
  }

  private rebuildStaffAgentsForCurrentMart(): void {
    this.staff = [];
    const activeMod = PRESTIGE_MODIFIERS.find((m) => m.id === this.save.progress.activeModifier);
    const maxLimit = activeMod?.maxStaffLimit ?? 99;

    const roster = this.save.staff.slice(0, maxLimit);
    roster.forEach((saved, idx) => {
      const angle = (idx / Math.max(1, roster.length)) * Math.PI * 2;
      const startPos = this.nav.findNearestFreeWorld(
        this.breakRoomPos.x - 1.2 + Math.cos(angle) * 0.8,
        this.breakRoomPos.z - 0.8 + Math.sin(angle) * 0.8,
      );
      this.staff.push({
        id: saved.id,
        name: saved.name,
        role: saved.role,
        tier: saved.tier,
        x: startPos.x,
        z: startPos.z,
        vx: 0,
        vz: 0,
        facingAngle: 0,
        carrying: [],
        carryCapacity: 3 + (this.save.upgrades.staffCapacity ?? 0) + saved.levels.carry,
        moveSpeed: 3.5 * (1 + 0.06 * (this.save.upgrades.staffSpeed ?? 0)),
        levels: { ...saved.levels },
        personality: [...saved.personality],
        currentJobId: null,
        currentTaskLabel: 'Break Room Lounge',
        targetX: startPos.x,
        targetZ: startPos.z,
        lastStationId: null,
        actionCooldown: 0,
        stuckSeconds: 0,
        lastCheckX: startPos.x,
        lastCheckZ: startPos.z,
        chatBubble: null,
      });
    });
    this.syncUpgradesToAgents();
  }

  /**
   * Main 60 Hz deterministic simulation tick (§6.2)
   */
  public step(rawDt: number): void {
    if (this.paused) return;

    if (this.hitStopSeconds > 0) {
      this.hitStopSeconds = Math.max(0, this.hitStopSeconds - rawDt);
      return;
    }

    const dt = Math.min(rawDt, 0.05) * this.timeScale;
    this.simTime += dt;
    this.martElapsedSeconds += dt;

    // 1. Rebuild spatial hash
    this.spatialScratch.length = 0;
    this.spatialScratch.push({
      id: 'hero',
      x: this.hero.x,
      z: this.hero.z,
      vx: this.hero.vx,
      vz: this.hero.vz,
    });
    for (let i = 0; i < this.staff.length; i++) {
      const s = this.staff[i]!;
      this.spatialScratch.push({ id: s.id, x: s.x, z: s.z, vx: s.vx, vz: s.vz });
    }
    for (let i = 0; i < this.customers.length; i++) {
      const c = this.customers[i]!;
      this.spatialScratch.push({ id: c.id, x: c.x, z: c.z, vx: c.vx, vz: c.vz });
    }
    this.nav.updateSpatialHash(this.spatialScratch);

    // 2. Player movement & proximity interactions
    this.tickHero(dt);

    // 3. Crops & Animals
    this.tickCrops(dt);
    this.tickAnimals(dt);

    // 4. Machines
    this.tickMachines(dt);

    // 5. Shelves
    this.tickShelves(dt);

    // 6 & 7. JobBroker rebuild + Contract-Net Staff AI
    this.tickJobBrokerAndStaff(dt);

    // 8. Customers spawn & FSM
    this.tickCustomers(dt);

    // 9. Checkouts
    this.tickCheckouts(dt);

    // 10. Thief & Security
    this.tickThief(dt);

    // 11. Onboarding 90-second beats + Star objectives + Auto-Hire Bot
    this.tickOnboardingAndObjectives(dt);
    this.tickAutoHireBot(dt);

    // 12. Periodic wage & auto-save
    this.wageTimer += dt;
    if (this.wageTimer >= 60) {
      this.wageTimer -= 60;
      this.syncMartToSave();
    }
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= 20) {
      this.autoSaveTimer = 0;
      this.syncMartToSave();
      persistSave(this.save);
    }
  }

  private tickHero(dt: number): void {
    this.hero.actionCooldown = Math.max(0, this.hero.actionCooldown - dt);
    this.hero.squashImpulse = Math.max(0, this.hero.squashImpulse - dt * 4.5);

    let dx = this.inputMoveX;
    let dz = this.inputMoveZ;

    if (dx === 0 && dz === 0 && this.pointerTarget) {
      const toX = this.pointerTarget.x - this.hero.x;
      const toZ = this.pointerTarget.z - this.hero.z;
      const dist = Math.hypot(toX, toZ);
      if (dist > 0.22) {
        dx = toX / dist;
        dz = toZ / dist;
      } else {
        this.pointerTarget = null;
      }
    }

    if (dx !== 0 || dz !== 0) {
      const moved = this.nav.steerAndMove(
        'hero',
        this.hero.x,
        this.hero.z,
        dx,
        dz,
        this.hero.moveSpeed,
        dt,
      );
      this.hero.x = moved.x;
      this.hero.z = moved.z;
      this.hero.vx = moved.vx;
      this.hero.vz = moved.vz;
      this.hero.facingAngle = Math.atan2(dx, dz);
    } else {
      this.hero.vx = 0;
      this.hero.vz = 0;
    }

    // Proximity Cash Collection (1.1m base + Cash Magnet upgrade, §7.9)
    const cashRadius = 1.1 + (this.save.upgrades.cashMagnet ?? 0) * 0.35;
    for (const till of this.tills) {
      if (!till.unlocked || till.cashOnCounter <= 0) continue;
      const d = Math.hypot(this.hero.x - till.blueprint.x, this.hero.z - till.blueprint.z);
      if (d <= cashRadius) {
        const collected = till.cashOnCounter;
        till.cashOnCounter = 0;
        till.cashIdleSeconds = 0;
        this.save.wallets.cash += collected;
        this.revenueEarned += collected;
        this.hero.squashImpulse = 1.0;
        this.events.emit('CASH_COLLECT', {
          x: till.blueprint.x,
          z: till.blueprint.z,
          amount: collected,
        });
      }
    }

    // Proximity Thief Catch (§7.10)
    if (this.thief.active && this.thief.phase !== 'TELEGRAPH') {
      const dThief = Math.hypot(this.hero.x - this.thief.x, this.hero.z - this.thief.z);
      if (dThief <= 1.65) {
        this.catchThief('hero');
      }
    }

    if (this.hero.actionCooldown > 0) return;

    const interactRadius = 1.45;

    // 1. Repair jammed machines or load/collect machines
    for (const m of this.machines) {
      if (!m.unlocked) continue;
      const d = Math.hypot(this.hero.x - m.blueprint.x, this.hero.z - m.blueprint.z);
      if (d > interactRadius) continue;

      if (m.jammed) {
        m.jammed = false;
        m.uncollectedOutputSeconds = 0;
        this.hero.squashImpulse = 0.9;
        this.hero.actionCooldown = 0.25;
        this.events.emit('MACHINE_REPAIRED', { machineId: m.id, x: m.blueprint.x, z: m.blueprint.z });
        return;
      }

      // Deposit matching input from hero stack
      for (const inp of m.inputProducts) {
        const currentIn = m.inputCounts[inp] ?? 0;
        if (currentIn < m.maxQueue) {
          const idx = this.hero.carrying.lastIndexOf(inp);
          if (idx !== -1) {
            this.hero.carrying.splice(idx, 1);
            m.inputCounts[inp] = currentIn + 1;
            this.hero.squashImpulse = 0.7;
            this.hero.actionCooldown = 0.16;
            this.events.emit('DEPOSIT_ITEM', {
              x: m.blueprint.x,
              z: m.blueprint.z,
              productId: inp,
              isHero: true,
              tier: getProduct(inp).tier,
            });
            return;
          }
        }
      }

      // Collect machine output
      if (m.outputCount > 0 && this.hero.carrying.length < this.hero.carryCapacity) {
        m.outputCount--;
        m.uncollectedOutputSeconds = 0;
        this.hero.carrying.push(m.outputProduct);
        this.hero.squashImpulse = 0.8;
        this.hero.actionCooldown = 0.16;
        this.events.emit('PICKUP_ITEM', {
          x: m.blueprint.x,
          z: m.blueprint.z,
          productId: m.outputProduct,
          isHero: true,
        });
        return;
      }
    }

    // 2. Deposit onto Shelves
    for (const s of this.shelves) {
      if (!s.unlocked || s.stock >= s.capacity) continue;
      const d = Math.hypot(this.hero.x - s.blueprint.x, this.hero.z - s.blueprint.z);
      if (d <= interactRadius) {
        const idx = this.hero.carrying.lastIndexOf(s.productId);
        if (idx !== -1) {
          this.hero.carrying.splice(idx, 1);
          s.stock++;
          s.emptyDurationSeconds = 0;
          this.hero.squashImpulse = 0.75;
          this.hero.actionCooldown = 0.14;
          this.events.emit('DEPOSIT_ITEM', {
            x: s.blueprint.x,
            z: s.blueprint.z,
            productId: s.productId,
            isHero: true,
            tier: getProduct(s.productId).tier,
          });
          return;
        }
      }
    }

    // 3. Feed or Collect Animals
    for (const a of this.animals) {
      if (!a.unlocked) continue;
      const d = Math.hypot(this.hero.x - a.blueprint.x, this.hero.z - a.blueprint.z);
      if (d > interactRadius) continue;

      if (a.feedStock < a.maxFeed) {
        const idx = this.hero.carrying.lastIndexOf(a.feedProductId);
        if (idx !== -1) {
          this.hero.carrying.splice(idx, 1);
          a.feedStock++;
          this.hero.squashImpulse = 0.7;
          this.hero.actionCooldown = 0.16;
          this.events.emit('ANIMAL_FED', { animalId: a.id, x: a.blueprint.x, z: a.blueprint.z });
          return;
        }
      }

      if (a.availableOutput > 0 && this.hero.carrying.length < this.hero.carryCapacity) {
        a.availableOutput--;
        this.hero.carrying.push(a.productId);
        this.hero.squashImpulse = 0.8;
        this.hero.actionCooldown = 0.16;
        this.events.emit('PICKUP_ITEM', {
          x: a.blueprint.x,
          z: a.blueprint.z,
          productId: a.productId,
          isHero: true,
        });
        return;
      }
    }

    // 4. Harvest Crops
    for (const c of this.crops) {
      if (!c.unlocked || c.availableUnits <= 0) continue;
      if (this.hero.carrying.length >= this.hero.carryCapacity) break;
      const d = Math.hypot(this.hero.x - c.blueprint.x, this.hero.z - c.blueprint.z);
      if (d <= interactRadius) {
        c.availableUnits--;
        this.hero.carrying.push(c.productId);
        this.hero.squashImpulse = 0.85;
        this.hero.actionCooldown = 0.16;
        this.events.emit('PICKUP_ITEM', {
          x: c.blueprint.x,
          z: c.blueprint.z,
          productId: c.productId,
          isHero: true,
        });
        return;
      }
    }
  }

  private tickCrops(dt: number): void {
    const yieldLvl = this.save.upgrades.cropYield ?? 0;
    const growthSpeed = 0.38 * (1 + 0.08 * yieldLvl);
    const bonusYield = Math.floor(yieldLvl / 3);

    for (const c of this.crops) {
      if (!c.unlocked) continue;
      c.maxUnits = 5 + bonusYield;
      if (c.availableUnits < c.maxUnits) {
        c.growthProgress += dt * growthSpeed;
        if (c.growthProgress >= 1.0) {
          c.growthProgress = 0;
          c.availableUnits = Math.min(c.maxUnits, c.availableUnits + 1 + Math.floor(bonusYield / 2));
          c.ripeTimer = 0;
        }
      } else {
        c.growthProgress = 1.0;
        c.ripeTimer += dt;
      }
    }
  }

  private tickAnimals(dt: number): void {
    const animalLvl = this.save.upgrades.animalOutput ?? 0;
    const speedMult = 1 + 0.08 * animalLvl;

    for (const a of this.animals) {
      if (!a.unlocked) continue;
      if (a.feedStock > 0) {
        a.continuousFedSeconds += dt;
        if (a.continuousFedSeconds >= 60 && !a.welfareBuffActive) {
          a.welfareBuffActive = true;
          this.events.emit('WELFARE_BUFF', { animalId: a.id, x: a.blueprint.x, z: a.blueprint.z });
        }

        const welfareMult = a.welfareBuffActive ? 1.15 : 1.0;
        a.produceTimer += dt * speedMult * welfareMult;
        if (a.produceTimer >= 3.6 && a.availableOutput < a.maxOutput) {
          a.produceTimer = 0;
          a.feedStock = Math.max(0, a.feedStock - 1);
          a.availableOutput = Math.min(a.maxOutput, a.availableOutput + 1);
        }
      } else {
        a.continuousFedSeconds = 0;
        a.welfareBuffActive = false;
      }
    }
  }

  private tickMachines(dt: number): void {
    const speedLvl = this.save.upgrades.machineSpeed ?? 0;
    const durationMult = Math.max(0.35, 1 - 0.05 * speedLvl);

    for (const m of this.machines) {
      if (!m.unlocked) continue;

      if (m.outputCount > 0) {
        m.uncollectedOutputSeconds += dt;
        // Soft Jam Mechanic after 45s uncollected output (§7.5)
        if (m.uncollectedOutputSeconds >= 45 && !m.jammed) {
          m.jammed = true;
          this.events.emit('MACHINE_JAM', { machineId: m.id, x: m.blueprint.x, z: m.blueprint.z });
        }
      } else {
        m.uncollectedOutputSeconds = 0;
      }

      if (m.jammed) {
        m.state = 'BLOCKED_OUTPUT';
        continue;
      }

      if (m.outputCount >= m.maxQueue) {
        m.state = 'BLOCKED_OUTPUT';
        continue;
      }

      const hasAllInputs = m.inputProducts.every((inp) => (m.inputCounts[inp] ?? 0) > 0);
      if (m.state !== 'PROCESSING') {
        if (hasAllInputs) {
          for (const inp of m.inputProducts) {
            m.inputCounts[inp] = Math.max(0, (m.inputCounts[inp] ?? 1) - 1);
          }
          m.state = 'PROCESSING';
          m.progress = 0;
        } else {
          m.state = m.outputCount > 0 ? 'OUTPUT_READY' : 'WAITING_INPUT';
        }
      }

      if (m.state === 'PROCESSING') {
        const effectiveDuration = Math.max(0.8, m.processTime * durationMult);
        m.progress += dt / effectiveDuration;
        if (m.progress >= 1.0) {
          m.progress = 0;
          m.outputCount++;
          m.state = 'OUTPUT_READY';
          this.events.emit('MACHINE_COMPLETE', {
            machineId: m.id,
            x: m.blueprint.x,
            z: m.blueprint.z,
            outputProduct: m.outputProduct,
          });
        }
      }
    }
  }

  private tickShelves(dt: number): void {
    for (const s of this.shelves) {
      if (!s.unlocked) continue;
      if (s.stock <= 0) {
        s.emptyDurationSeconds += dt;
      } else {
        s.emptyDurationSeconds = 0;
      }
    }
  }

  private tickJobBrokerAndStaff(dt: number): void {
    this.brokerTimer += dt;
    if (this.brokerTimer >= 0.25) {
      this.brokerTimer = 0;
      this.rebuildBrokerJobs();
      this.broker.auditStaleClaims(this.simTime, (staffId) => {
        const st = this.staff.find((s) => s.id === staffId);
        if (st) st.currentJobId = null;
      });

      const idleBidders: StaffBidder[] = [];
      for (const st of this.staff) {
        if (!st.currentJobId) {
          idleBidders.push({
            id: st.id,
            role: st.role,
            tier: st.tier,
            x: st.x,
            z: st.z,
            carryingItems: st.carrying,
            carryCapacity: st.carryCapacity,
            lastStationId: st.lastStationId,
            personality: st.personality,
          });
        }
      }

      const assignments = this.broker.runAuction(
        idleBidders,
        this.simTime,
        (x, z, r, ex) => this.nav.countAgentsNear(x, z, r, ex),
      );

      for (const [staffId, job] of assignments.entries()) {
        const st = this.staff.find((s) => s.id === staffId);
        if (st) {
          st.currentJobId = job.id;
          st.targetX = job.targetX;
          st.targetZ = job.targetZ;
          st.currentTaskLabel = `→ ${job.type.replace(/_/g, ' ')}`;
          st.chatBubble = null;
        }
      }
    }

    // Move & act for each staff member
    for (const st of this.staff) {
      st.actionCooldown = Math.max(0, st.actionCooldown - dt);

      const activeJob = st.currentJobId
        ? this.broker.getOpenJobs().find((j) => j.id === st.currentJobId) ?? null
        : null;

      if (st.currentJobId && !activeJob) {
        st.currentJobId = null;
      }

      let goalX = this.breakRoomPos.x - 0.8;
      let goalZ = this.breakRoomPos.z - 0.6;
      let goalKey = 'breakroom';

      if (activeJob) {
        goalX = activeJob.targetX;
        goalZ = activeJob.targetZ;
        goalKey = activeJob.stationId;
      } else {
        st.currentTaskLabel = 'Break Room Coffee';
        st.chatBubble = st.personality[1] > 0.5 ? 'chat' : 'coffee';
      }

      const distToGoal = Math.hypot(goalX - st.x, goalZ - st.z);

      if (distToGoal > 0.85) {
        const flow = this.nav.getFlowDirection(goalKey, goalX, goalZ, st.x, st.z);
        const moved = this.nav.steerAndMove(
          st.id,
          st.x,
          st.z,
          flow.dx,
          flow.dz,
          st.moveSpeed,
          dt,
        );

        const posDelta = Math.hypot(moved.x - st.lastCheckX, moved.z - st.lastCheckZ);
        if (posDelta < 0.02) {
          st.stuckSeconds += dt;
          if (st.stuckSeconds >= 1.2) {
            const free = this.nav.findNearestFreeWorld(goalX, goalZ);
            st.x = free.x;
            st.z = free.z;
            st.stuckSeconds = 0;
            this.stuckRecoveryCount++;
          }
        } else {
          st.stuckSeconds = 0;
          st.lastCheckX = moved.x;
          st.lastCheckZ = moved.z;
        }

        st.x = moved.x;
        st.z = moved.z;
        st.vx = moved.vx;
        st.vz = moved.vz;
        st.facingAngle = Math.atan2(flow.dx, flow.dz);
      } else {
        st.vx = 0;
        st.vz = 0;
        if (activeJob && st.actionCooldown <= 0) {
          this.executeStaffJobAction(st, activeJob);
        }
      }
    }
  }

  private rebuildBrokerJobs(): void {
    const smartShelfLvl = this.save.upgrades.smartShelf ?? 0;
    const proactiveRatio = Math.min(0.75, 0.35 + smartShelfLvl * 0.04);

    // 1. Thief intercept job
    if (this.thief.active) {
      this.broker.upsertJob({
        id: 'job_thief',
        type: 'INTERCEPT_THIEF',
        stationId: 'thief_target',
        targetX: this.thief.x,
        targetZ: this.thief.z,
        requiredRoles: ['guard'],
        basePriority: 150,
        urgencyBonus: 60,
      });
    } else {
      this.broker.removeJob('job_thief');
    }

    // 2. Serve Till jobs
    for (const till of this.tills) {
      const jId = `job_till_${till.id}`;
      if (till.unlocked && till.queueCustomerIds.length > 0) {
        this.broker.upsertJob({
          id: jId,
          type: 'SERVE_TILL',
          stationId: till.id,
          targetX: till.blueprint.x,
          targetZ: till.blueprint.z - 0.55,
          requiredRoles: ['cashier', 'barista'],
          basePriority: 95,
          urgencyBonus: till.queueCustomerIds.length * 18,
        });
      } else {
        this.broker.removeJob(jId);
      }
    }

    // 3. Shelf restock jobs & upstream supply pickup jobs
    for (const s of this.shelves) {
      const restockJobId = `job_shelf_${s.id}`;
      const fillRatio = s.stock / Math.max(1, s.capacity);
      if (s.unlocked && fillRatio <= proactiveRatio) {
        const isCritical = fillRatio < 0.25;
        this.broker.upsertJob({
          id: restockJobId,
          type: 'RESTOCK_SHELF',
          stationId: s.id,
          targetX: s.blueprint.x,
          targetZ: s.blueprint.z,
          requiredRoles: ['stocker', 'farmer', 'chef'],
          basePriority: 82,
          urgencyBonus: isCritical ? 40 : 15,
          productId: s.productId,
        });
      } else {
        this.broker.removeJob(restockJobId);
      }
    }

    // 4. Crops harvest jobs
    for (const c of this.crops) {
      const jId = `job_crop_${c.id}`;
      if (c.unlocked && c.availableUnits > 0) {
        this.broker.upsertJob({
          id: jId,
          type: 'HARVEST_CROP',
          stationId: c.id,
          targetX: c.blueprint.x,
          targetZ: c.blueprint.z,
          requiredRoles: ['farmer', 'stocker'],
          basePriority: 70,
          urgencyBonus: c.availableUnits * 5,
          productId: c.productId,
        });
      } else {
        this.broker.removeJob(jId);
      }
    }

    // 5. Animals feed & collect jobs
    for (const a of this.animals) {
      const feedId = `job_feed_${a.id}`;
      const colId = `job_anim_col_${a.id}`;
      if (a.unlocked && a.feedStock < a.maxFeed - 1) {
        this.broker.upsertJob({
          id: feedId,
          type: 'FEED_ANIMAL',
          stationId: a.id,
          targetX: a.blueprint.x,
          targetZ: a.blueprint.z,
          requiredRoles: ['farmer', 'stocker'],
          basePriority: 74,
          urgencyBonus: a.feedStock === 0 ? 35 : 10,
          productId: a.feedProductId,
        });
      } else {
        this.broker.removeJob(feedId);
      }

      if (a.unlocked && a.availableOutput > 0) {
        this.broker.upsertJob({
          id: colId,
          type: 'COLLECT_ANIMAL',
          stationId: a.id,
          targetX: a.blueprint.x,
          targetZ: a.blueprint.z,
          requiredRoles: ['farmer', 'stocker'],
          basePriority: 78,
          urgencyBonus: a.availableOutput * 8,
          productId: a.productId,
        });
      } else {
        this.broker.removeJob(colId);
      }
    }

    // 6. Machines repair, load, and collect jobs
    for (const m of this.machines) {
      const repId = `job_rep_${m.id}`;
      const loadId = `job_load_${m.id}`;
      const colId = `job_mcol_${m.id}`;

      if (m.unlocked && m.jammed) {
        this.broker.upsertJob({
          id: repId,
          type: 'REPAIR_MACHINE',
          stationId: m.id,
          targetX: m.blueprint.x,
          targetZ: m.blueprint.z,
          requiredRoles: ['chef', 'barista', 'stocker', 'farmer'],
          basePriority: 115,
          urgencyBonus: 45,
        });
      } else {
        this.broker.removeJob(repId);
      }

      const firstInput = m.inputProducts[0];
      if (m.unlocked && !m.jammed && firstInput && (m.inputCounts[firstInput] ?? 0) < m.maxQueue - 1) {
        this.broker.upsertJob({
          id: loadId,
          type: 'LOAD_MACHINE',
          stationId: m.id,
          targetX: m.blueprint.x,
          targetZ: m.blueprint.z,
          requiredRoles: ['chef', 'barista', 'stocker'],
          basePriority: 76,
          urgencyBonus: 20,
          productId: firstInput,
        });
      } else {
        this.broker.removeJob(loadId);
      }

      if (m.unlocked && m.outputCount > 0) {
        this.broker.upsertJob({
          id: colId,
          type: 'COLLECT_MACHINE',
          stationId: m.id,
          targetX: m.blueprint.x,
          targetZ: m.blueprint.z,
          requiredRoles: ['chef', 'barista', 'stocker'],
          basePriority: 84,
          urgencyBonus: m.outputCount * 10,
          productId: m.outputProduct,
        });
      } else {
        this.broker.removeJob(colId);
      }
    }
  }

  private executeStaffJobAction(st: StaffAgent, job: SimJob): void {
    const finishAndRelease = () => {
      st.lastStationId = job.stationId;
      this.broker.releaseClaim(job.id, st.id);
      st.currentJobId = null;
      st.actionCooldown = Math.max(0.15, 0.35 - st.levels.efficiency * 0.025);
    };

    if (job.type === 'INTERCEPT_THIEF') {
      if (this.thief.active) {
        this.catchThief('guard');
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'SERVE_TILL') {
      const till = this.tills.find((t) => t.id === job.stationId);
      if (till && till.queueCustomerIds.length > 0) {
        till.servingProgress += 0.55;
      } else {
        finishAndRelease();
      }
      return;
    }

    if (job.type === 'HARVEST_CROP') {
      const crop = this.crops.find((c) => c.id === job.stationId);
      if (crop && crop.availableUnits > 0) {
        // Enforce The No-Wait Rule (§7.2, F3 fix): take min(available, freeCarrySlots) & depart immediately
        const res = executeBatchPickupNoWait(
          crop.availableUnits,
          st.carrying.length,
          st.carryCapacity,
        );
        crop.availableUnits = res.remainingAtSource;
        for (let i = 0; i < res.taken; i++) {
          st.carrying.push(crop.productId);
        }
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'COLLECT_ANIMAL') {
      const anim = this.animals.find((a) => a.id === job.stationId);
      if (anim && anim.availableOutput > 0) {
        const res = executeBatchPickupNoWait(
          anim.availableOutput,
          st.carrying.length,
          st.carryCapacity,
        );
        anim.availableOutput = res.remainingAtSource;
        for (let i = 0; i < res.taken; i++) {
          st.carrying.push(anim.productId);
        }
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'COLLECT_MACHINE') {
      const mac = this.machines.find((m) => m.id === job.stationId);
      if (mac && mac.outputCount > 0) {
        const res = executeBatchPickupNoWait(
          mac.outputCount,
          st.carrying.length,
          st.carryCapacity,
        );
        mac.outputCount = res.remainingAtSource;
        mac.uncollectedOutputSeconds = 0;
        for (let i = 0; i < res.taken; i++) {
          st.carrying.push(mac.outputProduct);
        }
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'REPAIR_MACHINE') {
      const mac = this.machines.find((m) => m.id === job.stationId);
      if (mac && mac.jammed) {
        mac.jammed = false;
        mac.uncollectedOutputSeconds = 0;
        this.events.emit('MACHINE_REPAIRED', {
          machineId: mac.id,
          x: mac.blueprint.x,
          z: mac.blueprint.z,
        });
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'FEED_ANIMAL') {
      const anim = this.animals.find((a) => a.id === job.stationId);
      if (anim) {
        const needed = Math.max(0, anim.maxFeed - anim.feedStock);
        const toGive = Math.min(needed, Math.max(1, st.carrying.filter((p) => p === anim.feedProductId).length || 1));
        anim.feedStock = Math.min(anim.maxFeed, anim.feedStock + toGive);
        const idx = st.carrying.indexOf(anim.feedProductId);
        if (idx !== -1) st.carrying.splice(idx, 1);
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'LOAD_MACHINE') {
      const mac = this.machines.find((m) => m.id === job.stationId);
      if (mac) {
        for (const inp of mac.inputProducts) {
          const cur = mac.inputCounts[inp] ?? 0;
          if (cur < mac.maxQueue) {
            mac.inputCounts[inp] = Math.min(mac.maxQueue, cur + 2);
            const idx = st.carrying.indexOf(inp);
            if (idx !== -1) st.carrying.splice(idx, 1);
          }
        }
      }
      finishAndRelease();
      return;
    }

    if (job.type === 'RESTOCK_SHELF') {
      const shelf = this.shelves.find((s) => s.id === job.stationId);
      if (shelf && shelf.stock < shelf.capacity) {
        // Deposit matching items carried or restock from supply buffer
        const matchingCount = st.carrying.filter((id) => id === shelf.productId).length;
        const depositCount = Math.min(
          shelf.capacity - shelf.stock,
          matchingCount > 0 ? matchingCount : 2,
        );
        shelf.stock += depositCount;
        shelf.emptyDurationSeconds = 0;
        st.carrying = st.carrying.filter((id) => id !== shelf.productId);
        this.events.emit('DEPOSIT_ITEM', {
          x: shelf.blueprint.x,
          z: shelf.blueprint.z,
          productId: shelf.productId,
          isHero: false,
          tier: getProduct(shelf.productId).tier,
        });
      }
      finishAndRelease();
    }
  }

  private tickCustomers(dt: number): void {
    const unlockedShelves = this.shelves.filter((s) => s.unlocked);
    const unlockedProductsCount = Math.max(1, unlockedShelves.length);
    const marketingBuff = 1 + 0.07 * (this.save.upgrades.marketing ?? 0);
    const activeMod = PRESTIGE_MODIFIERS.find((m) => m.id === this.save.progress.activeModifier);
    const modTraffic = activeMod?.trafficMultiplier ?? 1.0;

    // Arrival rate formula (§7.8): baseRate = 0.55 customers/sec
    const lambda =
      0.55 *
      this.mart.martMultiplier *
      (1 + 0.08 * unlockedProductsCount) *
      marketingBuff *
      modTraffic;

    const popCap = Math.min(28, 6 + 2 * unlockedProductsCount);

    this.customerSpawnAccumulator += dt * lambda;
    while (this.customerSpawnAccumulator >= 1.0) {
      this.customerSpawnAccumulator -= 1.0;
      if (this.customers.length < popCap && unlockedShelves.length > 0) {
        this.spawnCustomer(unlockedShelves);
      }
    }

    const guardCount = this.staff.filter((s) => s.role === 'guard').length;
    const guardAura = 1 + guardCount * 0.08;

    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i]!;

      if (c.state === 'SHOPPING') {
        const shelf = this.shelves.find((s) => s.id === c.targetStationId);
        if (!shelf || !shelf.unlocked) {
          this.assignCustomerToBestTill(c);
          continue;
        }

        const dist = Math.hypot(shelf.blueprint.x - c.x, shelf.blueprint.z + 0.65 - c.z);
        if (dist > 0.75) {
          const flow = this.nav.getFlowDirection(
            shelf.id,
            shelf.blueprint.x,
            shelf.blueprint.z + 0.65,
            c.x,
            c.z,
          );
          const moved = this.nav.steerAndMove(c.id, c.x, c.z, flow.dx, flow.dz, c.moveSpeed, dt);
          c.x = moved.x;
          c.z = moved.z;
          c.facingAngle = Math.atan2(flow.dx, flow.dz);
        } else {
          // At shelf: pick item if available
          if (shelf.stock > 0) {
            shelf.stock--;
            c.basket.push(shelf.productId);
            c.desiredItems.shift();
            if (shelf.stock === 0) {
              this.events.emit('SHELF_LOW', {
                shelfId: shelf.id,
                x: shelf.blueprint.x,
                z: shelf.blueprint.z,
                productId: shelf.productId,
              });
            }
            if (c.desiredItems.length > 0) {
              const nextShelf = this.shelves.find(
                (s) => s.unlocked && s.productId === c.desiredItems[0],
              );
              if (nextShelf) {
                c.targetStationId = nextShelf.id;
              } else {
                this.assignCustomerToBestTill(c);
              }
            } else {
              this.assignCustomerToBestTill(c);
            }
          } else {
            // Never-block rule (§7.8): re-target to any available product after 2s
            c.shoppingWaitSeconds += dt;
            c.retargetTimer += dt;
            if (c.retargetTimer >= 2.0) {
              c.retargetTimer = 0;
              const stockedShelf = this.shelves.find((s) => s.unlocked && s.stock > 0);
              if (stockedShelf) {
                c.targetStationId = stockedShelf.id;
                c.desiredItems[0] = stockedShelf.productId;
              }
            }
            if (c.shoppingWaitSeconds > 12.0) {
              if (c.basket.length > 0) {
                this.assignCustomerToBestTill(c);
              } else {
                c.state = 'IMPATIENT_EXIT';
                c.targetX = 0;
                c.targetZ = 6.2;
              }
            }
          }
        }
      } else if (c.state === 'QUEUE') {
        const till = this.tills.find((t) => t.id === c.targetStationId);
        if (!till) {
          c.state = 'EXIT';
          continue;
        }
        const qIndex = Math.max(0, till.queueCustomerIds.indexOf(c.id));
        const qTargetX = till.blueprint.x + (qIndex % 2 === 0 ? -0.15 : 0.15);
        const qTargetZ = till.blueprint.z - 0.9 - qIndex * 0.65;

        const dist = Math.hypot(qTargetX - c.x, qTargetZ - c.z);
        if (dist > 0.3) {
          const dx = (qTargetX - c.x) / dist;
          const dz = (qTargetZ - c.z) / dist;
          const moved = this.nav.steerAndMove(c.id, c.x, c.z, dx, dz, c.moveSpeed, dt);
          c.x = moved.x;
          c.z = moved.z;
          c.facingAngle = Math.atan2(dx, dz);
        } else {
          c.facingAngle = 0;
          if (qIndex > 0) {
            c.patience -= dt / guardAura;
            if (c.patience <= 0) {
              till.queueCustomerIds = till.queueCustomerIds.filter((id) => id !== c.id);
              c.state = 'ANGRY_EXIT';
              this.angryExits++;
            }
          }
        }
      } else if (c.state === 'EXIT' || c.state === 'IMPATIENT_EXIT' || c.state === 'ANGRY_EXIT') {
        const exitX = 0;
        const exitZ = 6.2;
        const dist = Math.hypot(exitX - c.x, exitZ - c.z);
        if (dist < 0.6) {
          this.customers.splice(i, 1);
        } else {
          const dx = (exitX - c.x) / dist;
          const dz = (exitZ - c.z) / dist;
          c.x += dx * c.moveSpeed * 1.15 * dt;
          c.z += dz * c.moveSpeed * 1.15 * dt;
          c.facingAngle = Math.atan2(dx, dz);
        }
      }
    }
  }

  private spawnCustomer(unlockedShelves: ShelfStationState[]): void {
    const archetype = this.rng.pick(CUSTOMER_ARCHETYPES);
    const count = this.rng.int(1, 3);
    const desired: string[] = [];
    // Prefer stocked shelves first so early ramp is snappy and generous
    const stocked = unlockedShelves.filter((s) => s.stock > 0);
    const pool = stocked.length > 0 ? stocked : unlockedShelves;
    for (let i = 0; i < count; i++) {
      desired.push(this.rng.pick(pool).productId);
    }

    const firstShelf =
      unlockedShelves.find((s) => s.productId === desired[0]) ?? unlockedShelves[0]!;

    const basePatience =
      (18 + 4 * (this.save.upgrades.patience ?? 0)) *
      (this.save.settings.a11y.assistPatienceBonus ? 1.5 : 1.0);

    const palette = [0x2e9e9b, 0xff8b6b, 0x8e5bc9, 0x4fa85c, 0xffc65c, 0x23324a];
    this.customerSeq++;

    this.customers.push({
      id: `cust_${this.customerSeq}`,
      archetype,
      x: this.rng.range(-1.4, 1.4),
      z: 5.9,
      vx: 0,
      vz: 0,
      facingAngle: Math.PI,
      state: 'SHOPPING',
      desiredItems: desired,
      basket: [],
      targetStationId: firstShelf.id,
      targetX: firstShelf.blueprint.x,
      targetZ: firstShelf.blueprint.z,
      patience: basePatience,
      maxPatience: basePatience,
      shoppingWaitSeconds: 0,
      retargetTimer: 0,
      moveSpeed: archetype === 'exec_hurried' || archetype === 'jogger' ? 3.4 : 2.7,
      shirtColor: this.rng.pick(palette),
    });
  }

  private assignCustomerToBestTill(c: CustomerAgent): void {
    if (c.basket.length === 0) {
      c.state = 'IMPATIENT_EXIT';
      return;
    }
    const unlockedTills = this.tills.filter((t) => t.unlocked);
    const bestTill =
      unlockedTills.sort((a, b) => a.queueCustomerIds.length - b.queueCustomerIds.length)[0] ??
      this.tills[0]!;
    if (!bestTill.queueCustomerIds.includes(c.id)) {
      bestTill.queueCustomerIds.push(c.id);
    }
    c.targetStationId = bestTill.id;
    c.state = 'QUEUE';
  }

  private tickCheckouts(dt: number): void {
    const serveTime = Math.max(0.35, 1.1 - 0.03 * (this.save.upgrades.checkoutSpeed ?? 0));

    for (const till of this.tills) {
      if (!till.unlocked) continue;

      if (till.cashOnCounter > 0) {
        till.cashIdleSeconds += dt;
      } else {
        till.cashIdleSeconds = 0;
      }

      if (till.queueCustomerIds.length === 0) {
        till.servingProgress = 0;
        continue;
      }

      const frontCustId = till.queueCustomerIds[0]!;
      const frontCust = this.customers.find((c) => c.id === frontCustId);
      if (!frontCust) {
        till.queueCustomerIds.shift();
        continue;
      }

      const distCustToTill = Math.hypot(
        till.blueprint.x - frontCust.x,
        till.blueprint.z - 0.9 - frontCust.z,
      );
      if (distCustToTill > 1.1) continue;

      // Check if hero OR a cashier/staff is near the till
      const heroNear =
        Math.hypot(this.hero.x - till.blueprint.x, this.hero.z - till.blueprint.z) <= 1.85;
      const staffNear = this.staff.some(
        (s) =>
          (s.role === 'cashier' || s.role === 'barista' || s.tier === 3) &&
          Math.hypot(s.x - till.blueprint.x, s.z - till.blueprint.z) <= 1.95,
      );

      if (heroNear || staffNear) {
        till.servingProgress += dt / serveTime;
        if (till.servingProgress >= 1.0) {
          till.servingProgress = 0;
          till.queueCustomerIds.shift();
          this.completeCustomerSale(till, frontCust);
        }
      }
    }
  }

  private completeCustomerSale(till: TillStationState, cust: CustomerAgent): void {
    let totalSale = 0;
    cust.basket.forEach((prodId, idx) => {
      const pDef = getProduct(prodId);
      const price = computeSalePrice(
        pDef.baseSalePrice,
        this.mart.index,
        this.save.upgrades.marketing ?? 0,
        this.save.progress.prestige,
        this.save.settings.a11y.assistIncomeBonus,
      );
      totalSale += price;
      this.events.emit('REGISTER_SCAN', {
        x: till.blueprint.x,
        z: till.blueprint.z,
        stepIndex: idx,
        amount: price,
      });
    });

    cust.basket = [];
    cust.state = 'EXIT';
    this.customersServed++;

    // Physical cash stack spawns on counter (§7.9)
    till.cashOnCounter += totalSale;
    this.events.emit('SALE_COMPLETE', {
      x: till.blueprint.x,
      z: till.blueprint.z,
      amount: totalSale,
      customerId: cust.id,
    });
    this.events.emit('CASH_SPAWN', {
      x: till.blueprint.x + 0.45,
      z: till.blueprint.z,
      amount: till.cashOnCounter,
    });
  }

  private tickThief(dt: number): void {
    // Hiring a Guard or enabling Assist No-Thief disables thief spawning (§7.10, §10.5)
    const hasGuard = this.staff.some((s) => s.role === 'guard');
    if (hasGuard || this.save.settings.a11y.assistNoThief) {
      if (this.thief.active) {
        this.catchThief('guard');
      }
      return;
    }

    if (!this.thief.active) {
      const threshold = 80 + 40 * this.mart.index;
      const targetTill = this.tills.find(
        (t) => t.unlocked && t.cashOnCounter > threshold && t.cashIdleSeconds >= 20,
      );
      if (targetTill) {
        this.thief = {
          active: true,
          phase: 'TELEGRAPH',
          telegraphSecondsLeft: 6.0,
          x: 2.8,
          z: 6.1,
          facingAngle: Math.PI,
          targetTillId: targetTill.id,
          stolenAmount: 0,
        };
        this.events.emit('THIEF_TELEGRAPH', {
          x: this.thief.x,
          z: this.thief.z,
          secondsLeft: 6,
        });
      }
      return;
    }

    if (this.thief.phase === 'TELEGRAPH') {
      this.thief.telegraphSecondsLeft -= dt;
      if (this.thief.telegraphSecondsLeft <= 0) {
        this.thief.phase = 'APPROACH';
        this.events.emit('THIEF_SPAWN', { x: this.thief.x, z: this.thief.z });
      }
      return;
    }

    const till = this.tills.find((t) => t.id === this.thief.targetTillId) ?? this.tills[0]!;
    if (this.thief.phase === 'APPROACH') {
      if (till.cashOnCounter <= 0) {
        this.thief.active = false;
        return;
      }
      const dx = till.blueprint.x - this.thief.x;
      const dz = till.blueprint.z - this.thief.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.55) {
        this.thief.x += (dx / dist) * 2.8 * dt;
        this.thief.z += (dz / dist) * 2.8 * dt;
        this.thief.facingAngle = Math.atan2(dx, dz);
      } else {
        // Loss is capped at 25% of the pile, never the whole thing (§7.10)
        const loss = Math.max(1, Math.floor(till.cashOnCounter * 0.25));
        till.cashOnCounter -= loss;
        till.cashIdleSeconds = 0;
        this.thief.stolenAmount = loss;
        this.thief.phase = 'ESCAPE';
        this.events.emit('THIEF_STOLE', { x: this.thief.x, z: this.thief.z, amount: loss });
      }
    } else if (this.thief.phase === 'ESCAPE') {
      const exitX = 3.2;
      const exitZ = 6.3;
      const dx = exitX - this.thief.x;
      const dz = exitZ - this.thief.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        this.thief.active = false;
      } else {
        this.thief.x += (dx / dist) * 3.1 * dt;
        this.thief.z += (dz / dist) * 3.1 * dt;
        this.thief.facingAngle = Math.atan2(dx, dz);
      }
    }
  }

  public catchThief(by: 'hero' | 'guard'): void {
    if (!this.thief.active) return;
    if (this.thief.stolenAmount > 0) {
      this.save.wallets.cash += this.thief.stolenAmount;
      this.revenueEarned += this.thief.stolenAmount;
    }
    const { x, z } = this.thief;
    this.thief.active = false;
    this.events.emit('THIEF_CAUGHT', { x, z, by });
  }

  /**
   * 90-Second Onboarding Beats (§17) & 3-Star Objectives (§9)
   */
  private tickOnboardingAndObjectives(_dt: number): void {
    if (this.mart.index === 1) {
      // 18.0s: Grant FREE Cashier Mia (§17)
      if (this.martElapsedSeconds >= 18 && !this.save.staff.some((s) => s.name === 'Mia')) {
        this.grantFreeTutorialStaff('cashier', 'Mia');
        this.tutorialStep = Math.max(this.tutorialStep, 4);
        this.events.emit('TUTORIAL_BEAT', { step: 4, textKey: 'tutorialMia' });
      }

      // 26.0s: Grant FREE Stocker Sam (§17)
      if (this.martElapsedSeconds >= 26 && !this.save.staff.some((s) => s.name === 'Sam')) {
        this.grantFreeTutorialStaff('stocker', 'Sam');
        this.tutorialStep = Math.max(this.tutorialStep, 5);
        this.events.emit('TUTORIAL_BEAT', { step: 5, textKey: 'tutorialSam' });
      }
    }

    // Evaluate 3-Star Objectives (§9)
    const currentStars = this.save.progress.stars[this.mart.index] ?? 0;
    if (currentStars < 1 && this.revenueEarned >= this.mart.star1Revenue) {
      this.save.progress.stars[this.mart.index] = 1;
      if (!this.save.progress.stars[this.mart.index + 1] && this.mart.index < 20) {
        this.save.progress.stars[this.mart.index + 1] = 0;
      }
      this.hitStopSeconds = 0.06; // 60ms hit-stop on star objective completion (§12)
      this.events.emit('STAR_EARNED', {
        martIndex: this.mart.index,
        star: 1,
        label: `Revenue $${this.mart.star1Revenue}`,
      });
    }
    if (
      (this.save.progress.stars[this.mart.index] ?? 0) < 2 &&
      this.revenueEarned >= this.mart.star1Revenue &&
      this.customersServed >= this.mart.star2Customers &&
      this.angryExits === 0
    ) {
      this.save.progress.stars[this.mart.index] = 2;
      this.hitStopSeconds = 0.06;
      this.events.emit('STAR_EARNED', {
        martIndex: this.mart.index,
        star: 2,
        label: `${this.mart.star2Customers} Happy Shoppers`,
      });
    }
    if (
      (this.save.progress.stars[this.mart.index] ?? 0) < 3 &&
      (this.save.progress.stars[this.mart.index] ?? 0) >= 2 &&
      this.martElapsedSeconds <= this.mart.star3Seconds
    ) {
      this.save.progress.stars[this.mart.index] = 3;
      this.hitStopSeconds = 0.06;
      this.events.emit('STAR_EARNED', {
        martIndex: this.mart.index,
        star: 3,
        label: `Speed Master (<${this.mart.star3Seconds}s)`,
      });
      this.events.emit('MART_COMPLETE', {
        martIndex: this.mart.index,
        martName: this.mart.name,
      });
    }
  }

  private tickAutoHireBot(dt: number): void {
    const autoHireLvl = this.save.upgrades.autoHire ?? 0;
    if (autoHireLvl <= 0) return;

    this.autoHireTimer += dt;
    if (this.autoHireTimer < 5.0) return;
    this.autoHireTimer = 0;

    if (this.save.autoHire.autoUpgradeCheapest) {
      let cheapestTrack: UpgradeTrack | null = null;
      let cheapestCost = Infinity;
      for (const [track, def] of UPGRADE_MAP.entries()) {
        const lvl = this.save.upgrades[track] ?? 0;
        if (lvl < def.maxLevel) {
          const cost = computeUpgradeCost(track, lvl);
          if (cost < cheapestCost) {
            cheapestCost = cost;
            cheapestTrack = track;
          }
        }
      }
      if (cheapestTrack && this.save.wallets.cash >= cheapestCost) {
        this.buyUpgrade(cheapestTrack);
      }
    }
  }

  public grantFreeTutorialStaff(role: StaffRole, fixedName: string): void {
    const id = `staff_free_${role}_${fixedName.toLowerCase()}`;
    if (this.save.staff.some((s) => s.id === id)) return;
    this.save.staff.push({
      id,
      name: fixedName,
      role,
      tier: 1,
      martIndex: this.mart.index,
      levels: { speed: 1, carry: 1, efficiency: 1, stamina: 1 },
      personality: [0.85, 0.4, 0.75],
    });
    this.rebuildStaffAgentsForCurrentMart();
    this.events.emit('STAFF_HIRED', { staffId: id, name: fixedName, role, free: true });
  }

  /**
   * Transactional, Idempotent Upgrade Purchase (§1.5 F5 fix, Acceptance Test T8)
   */
  public buyUpgrade(track: UpgradeTrack, txId?: string): boolean {
    if (txId && this.processedTransactionIds.has(txId)) {
      return false;
    }
    const def = UPGRADE_MAP.get(track);
    if (!def) return false;
    const currentLevel = this.save.upgrades[track] ?? 0;
    if (currentLevel >= def.maxLevel) return false;

    const cost = computeUpgradeCost(track, currentLevel);
    if (this.save.wallets.cash < cost) return false;

    if (txId) this.processedTransactionIds.add(txId);
    this.save.wallets.cash -= cost;
    this.save.upgrades[track] = currentLevel + 1;
    this.purchaseReceiptCount++;
    this.syncUpgradesToAgents();
    this.syncMartToSave();
    this.events.emit('PURCHASE_SUCCESS', {
      label: `${def.name} Lv.${currentLevel + 1}`,
      cost,
      category: 'upgrade',
    });
    return true;
  }

  /**
   * Transactional Staff Hire (§8.4)
   */
  public hireStaff(role: StaffRole, txId?: string): boolean {
    if (txId && this.processedTransactionIds.has(txId)) return false;
    const roleCount = this.save.staff.filter((s) => s.role === role).length;
    const cost = computeHireCost(role, roleCount);
    if (this.save.wallets.cash < cost) return false;

    if (txId) this.processedTransactionIds.add(txId);
    this.save.wallets.cash -= cost;
    this.purchaseReceiptCount++;

    const name = STAFF_NAMES[this.save.staff.length % STAFF_NAMES.length] ?? 'Alex';
    const id = `staff_${this.save.staff.length + 1}_${role}`;
    this.save.staff.push({
      id,
      name,
      role,
      tier: 1,
      martIndex: this.mart.index,
      levels: { speed: 1, carry: 1, efficiency: 1, stamina: 1 },
      personality: [
        +this.rng.range(0.4, 0.98).toFixed(2),
        +this.rng.range(0.2, 0.9).toFixed(2),
        +this.rng.range(0.4, 0.95).toFixed(2),
      ],
    });
    this.rebuildStaffAgentsForCurrentMart();
    this.syncMartToSave();
    this.events.emit('STAFF_HIRED', { staffId: id, name, role });
    this.events.emit('PURCHASE_SUCCESS', {
      label: `Hired ${name} (${role})`,
      cost,
      category: 'staff',
    });
    return true;
  }

  /** Hire whichever role has the highest open job urgency (§8.6) */
  public hireBottleneckRole(): boolean {
    const counts: Record<StaffRole, number> = {
      cashier: 0,
      stocker: 0,
      farmer: 0,
      chef: 0,
      barista: 0,
      guard: 0,
    };
    for (const s of this.save.staff) counts[s.role]++;
    const ordered: StaffRole[] = ['stocker', 'cashier', 'farmer', 'chef', 'barista', 'guard'];
    ordered.sort((a, b) => counts[a] - counts[b]);
    for (const role of ordered) {
      if (this.hireStaff(role)) return true;
    }
    return false;
  }

  /** Upgrade individual staff member & promote tier at levels 4 and 8 (§8.5) */
  public upgradeStaffMember(
    staffId: string,
    stat: 'speed' | 'carry' | 'efficiency' | 'stamina',
  ): boolean {
    const saved = this.save.staff.find((s) => s.id === staffId);
    if (!saved) return false;
    const cur = saved.levels[stat];
    if (cur >= 8) return false;
    const cost = Math.ceil(65 * Math.pow(1.32, cur - 1));
    if (this.save.wallets.cash < cost) return false;

    this.save.wallets.cash -= cost;
    saved.levels[stat] = cur + 1;
    this.purchaseReceiptCount++;

    const totalLevels =
      saved.levels.speed + saved.levels.carry + saved.levels.efficiency + saved.levels.stamina;
    const newTier: 1 | 2 | 3 = totalLevels >= 24 ? 3 : totalLevels >= 12 ? 2 : 1;
    if (newTier > saved.tier) {
      saved.tier = newTier;
      this.events.emit('STAFF_PROMOTED', {
        staffId: saved.id,
        name: saved.name,
        tier: newTier,
      });
    }

    this.rebuildStaffAgentsForCurrentMart();
    this.syncMartToSave();
    this.events.emit('PURCHASE_SUCCESS', {
      label: `${saved.name} ${stat} Lv.${cur + 1}`,
      cost,
      category: 'staff',
    });
    return true;
  }

  /** Unlock a locked station plot in the current mart */
  public unlockStationPlot(stationId: string, txId?: string): boolean {
    if (txId && this.processedTransactionIds.has(txId)) return false;
    const bp = this.mart.stations.find((s) => s.id === stationId);
    if (!bp) return false;

    const savedMart = this.save.marts[this.mart.index];
    if (!savedMart || savedMart.unlockedPlots.includes(stationId)) return false;
    if (this.save.wallets.cash < bp.unlockCost) return false;

    if (txId) this.processedTransactionIds.add(txId);
    this.save.wallets.cash -= bp.unlockCost;
    savedMart.unlockedPlots.push(stationId);
    this.purchaseReceiptCount++;

    for (const c of this.crops) if (c.id === stationId) { c.unlocked = true; c.availableUnits = 3; }
    for (const a of this.animals) if (a.id === stationId) { a.unlocked = true; a.feedStock = 3; a.availableOutput = 2; }
    for (const m of this.machines) if (m.id === stationId) { m.unlocked = true; m.outputCount = 1; }
    for (const s of this.shelves) if (s.id === stationId) { s.unlocked = true; s.stock = 3; }
    for (const t of this.tills) if (t.id === stationId) { t.unlocked = true; }

    this.events.emit('PLOT_UNLOCKED', {
      plotId: stationId,
      label: bp.label,
      x: bp.x,
      z: bp.z,
    });
    this.events.emit('PURCHASE_SUCCESS', {
      label: `Unlocked ${bp.label}`,
      cost: bp.unlockCost,
      category: 'plot',
    });
    this.syncMartToSave();
    return true;
  }

  public syncMartToSave(): void {
    const mState = this.save.marts[this.mart.index];
    if (!mState) return;
    mState.revenueEarned = Math.round(this.revenueEarned);
    mState.customersServed = this.customersServed;
    mState.angryExits = this.angryExits;
    mState.elapsedSeconds = Math.round(this.martElapsedSeconds);
    mState.tutorialStep = this.tutorialStep;

    for (const s of this.shelves) {
      mState.shelfStocks[s.id] = s.stock;
    }
    for (const m of this.machines) {
      const firstIn = m.inputProducts[0] ? (m.inputCounts[m.inputProducts[0]] ?? 0) : 0;
      mState.machineStocks[m.id] = {
        input: firstIn,
        output: m.outputCount,
        jammed: m.jammed,
      };
    }
    for (const t of this.tills) {
      mState.cashOnCounters[t.id] = Math.round(t.cashOnCounter);
    }
  }

  /** Computes schematic flow arrows for Manager Cam (§5.2) */
  public getManagerFlowArrows(): FlowArrowData[] {
    const arrows: FlowArrowData[] = [];
    for (const st of this.staff) {
      if (st.currentJobId) {
        arrows.push({
          fromX: st.x,
          fromZ: st.z,
          toX: st.targetX,
          toZ: st.targetZ,
          kind: 'staff',
        });
      }
    }
    for (const s of this.shelves) {
      if (!s.unlocked) continue;
      const till = this.tills[0];
      if (till) {
        arrows.push({
          fromX: s.blueprint.x,
          fromZ: s.blueprint.z,
          toX: till.blueprint.x,
          toZ: till.blueprint.z,
          kind: 'goods',
        });
      }
    }
    return arrows;
  }

  /** Computes a deterministic hash of simulation state for Acceptance Test T14 */
  public computeStateHash(): string {
    const summary = {
      t: Math.round(this.simTime * 60),
      hx: Math.round(this.hero.x * 100),
      hz: Math.round(this.hero.z * 100),
      cash: this.save.wallets.cash,
      rev: this.revenueEarned,
      served: this.customersServed,
      rng: this.rng.getState(),
    };
    return JSON.stringify(summary);
  }
}
