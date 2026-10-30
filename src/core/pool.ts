/**
 * Zero-Allocation Object Pool for transient simulation and visual entities
 */

export class ObjectPool<T> {
  private readonly items: T[] = [];
  private activeCount = 0;

  constructor(factory: (index: number) => T, capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.items.push(factory(i));
    }
  }

  public acquire(): T | null {
    if (this.activeCount >= this.items.length) {
      return null;
    }
    const item = this.items[this.activeCount]!;
    this.activeCount++;
    return item;
  }

  public releaseAt(index: number): void {
    if (index < 0 || index >= this.activeCount) return;
    this.activeCount--;
    const temp = this.items[this.activeCount]!;
    this.items[this.activeCount] = this.items[index]!;
    this.items[index] = temp;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getAt(index: number): T {
    return this.items[index]!;
  }

  public getCapacity(): number {
    return this.items.length;
  }

  public resetAll(): void {
    this.activeCount = 0;
  }
}
