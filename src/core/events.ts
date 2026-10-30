/**
 * Decoupled Event Bus for Sim -> Render / Audio / UI communication
 */

export type SimEventType =
  | 'PICKUP_ITEM'
  | 'DEPOSIT_ITEM'
  | 'REGISTER_SCAN'
  | 'SALE_COMPLETE'
  | 'CASH_SPAWN'
  | 'CASH_COLLECT'
  | 'PURCHASE_SUCCESS'
  | 'PLOT_UNLOCKED'
  | 'STAFF_HIRED'
  | 'STAFF_PROMOTED'
  | 'MACHINE_COMPLETE'
  | 'MACHINE_JAM'
  | 'MACHINE_REPAIRED'
  | 'SHELF_LOW'
  | 'THIEF_TELEGRAPH'
  | 'THIEF_SPAWN'
  | 'THIEF_CAUGHT'
  | 'THIEF_STOLE'
  | 'STAR_EARNED'
  | 'MART_COMPLETE'
  | 'ANIMAL_FED'
  | 'WELFARE_BUFF'
  | 'TUTORIAL_BEAT'
  | 'TOAST'
  | 'CAPTION';

export interface SimEventPayloads {
  PICKUP_ITEM: { x: number; z: number; productId: string; isHero: boolean };
  DEPOSIT_ITEM: { x: number; z: number; productId: string; isHero: boolean; tier: number };
  REGISTER_SCAN: { x: number; z: number; stepIndex: number; amount: number };
  SALE_COMPLETE: { x: number; z: number; amount: number; customerId: string };
  CASH_SPAWN: { x: number; z: number; amount: number };
  CASH_COLLECT: { x: number; z: number; amount: number };
  PURCHASE_SUCCESS: { label: string; cost: number; category: 'upgrade' | 'staff' | 'plot' };
  PLOT_UNLOCKED: { plotId: string; label: string; x: number; z: number };
  STAFF_HIRED: { staffId: string; name: string; role: string; free?: boolean };
  STAFF_PROMOTED: { staffId: string; name: string; tier: 1 | 2 | 3 };
  MACHINE_COMPLETE: { machineId: string; x: number; z: number; outputProduct: string };
  MACHINE_JAM: { machineId: string; x: number; z: number };
  MACHINE_REPAIRED: { machineId: string; x: number; z: number };
  SHELF_LOW: { shelfId: string; x: number; z: number; productId: string };
  THIEF_TELEGRAPH: { x: number; z: number; secondsLeft: number };
  THIEF_SPAWN: { x: number; z: number };
  THIEF_CAUGHT: { x: number; z: number; by: 'hero' | 'guard' };
  THIEF_STOLE: { x: number; z: number; amount: number };
  STAR_EARNED: { martIndex: number; star: 1 | 2 | 3; label: string };
  MART_COMPLETE: { martIndex: number; martName: string };
  ANIMAL_FED: { animalId: string; x: number; z: number };
  WELFARE_BUFF: { animalId: string; x: number; z: number };
  TUTORIAL_BEAT: { step: number; textKey: string };
  TOAST: { message: string; tone: 'gold' | 'leaf' | 'honey' | 'tomato' | 'berry' };
  CAPTION: { label: string };
}

type Handler<K extends SimEventType> = (payload: SimEventPayloads[K]) => void;

export class EventBus {
  private listeners = new Map<SimEventType, Set<Handler<any>>>();

  public on<K extends SimEventType>(type: K, handler: Handler<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  public emit<K extends SimEventType>(type: K, payload: SimEventPayloads[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
