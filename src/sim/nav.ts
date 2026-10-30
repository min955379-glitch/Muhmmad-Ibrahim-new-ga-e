/**
 * Navigation Grid (0.25m cells), Budgeted Dijkstra Flow Fields,
 * 1m Spatial Hash, ORCA-Lite Local Avoidance, and Stuck Detector (§7.1)
 */

export interface ObstacleBox {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

export interface AgentSpatialEntry {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export class NavSystem {
  public readonly minX = -8.5;
  public readonly maxX = 8.5;
  public readonly minZ = -6.5;
  public readonly maxZ = 6.5;
  public readonly cellSize = 0.25;
  public readonly cols: number;
  public readonly rows: number;
  private blocked: Uint8Array;
  private flowFields = new Map<string, Float32Array>(); // [dirX, dirZ] per cell
  private spatialBuckets = new Map<number, AgentSpatialEntry[]>();
  private readonly personalRadius = 0.34;

  constructor() {
    this.cols = Math.ceil((this.maxX - this.minX) / this.cellSize);
    this.rows = Math.ceil((this.maxZ - this.minZ) / this.cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  public rebuildObstacles(obstacles: readonly ObstacleBox[]): void {
    this.blocked.fill(0);
    this.flowFields.clear();
    const inflation = 0.26;

    for (let r = 0; r < this.rows; r++) {
      const wz = this.minZ + (r + 0.5) * this.cellSize;
      for (let c = 0; c < this.cols; c++) {
        const wx = this.minX + (c + 0.5) * this.cellSize;
        for (let i = 0; i < obstacles.length; i++) {
          const ob = obstacles[i]!;
          if (
            Math.abs(wx - ob.x) <= ob.halfW + inflation &&
            Math.abs(wz - ob.z) <= ob.halfD + inflation
          ) {
            this.blocked[r * this.cols + c] = 1;
            break;
          }
        }
      }
    }
  }

  public worldToCell(x: number, z: number): { c: number; r: number } {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cellSize)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cellSize)));
    return { c, r };
  }

  public cellToWorld(c: number, r: number): { x: number; z: number } {
    return {
      x: this.minX + (c + 0.5) * this.cellSize,
      z: this.minZ + (r + 0.5) * this.cellSize,
    };
  }

  public isBlockedWorld(x: number, z: number): boolean {
    if (x < this.minX + 0.3 || x > this.maxX - 0.3 || z < this.minZ + 0.3 || z > this.maxZ - 0.3) {
      return true;
    }
    const { c, r } = this.worldToCell(x, z);
    return this.blocked[r * this.cols + c] === 1;
  }

  public findNearestFreeWorld(x: number, z: number): { x: number; z: number } {
    const start = this.worldToCell(x, z);
    if (this.blocked[start.r * this.cols + start.c] === 0) {
      return {
        x: Math.max(this.minX + 0.4, Math.min(this.maxX - 0.4, x)),
        z: Math.max(this.minZ + 0.4, Math.min(this.maxZ - 0.4, z)),
      };
    }
    for (let radius = 1; radius <= 16; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nc = start.c + dc;
          const nr = start.r + dr;
          if (nc >= 1 && nc < this.cols - 1 && nr >= 1 && nr < this.rows - 1) {
            if (this.blocked[nr * this.cols + nc] === 0) {
              return this.cellToWorld(nc, nr);
            }
          }
        }
      }
    }
    return { x: 0, z: 2.5 };
  }

  /** Gets or computes a Dijkstra flow field toward a goal position */
  public getFlowDirection(goalId: string, goalX: number, goalZ: number, fromX: number, fromZ: number): { dx: number; dz: number } {
    let field = this.flowFields.get(goalId);
    if (!field) {
      field = this.buildFlowField(goalX, goalZ);
      this.flowFields.set(goalId, field);
    }
    const { c, r } = this.worldToCell(fromX, fromZ);
    const idx = (r * this.cols + c) * 2;
    const dx = field[idx] ?? 0;
    const dz = field[idx + 1] ?? 0;
    if (dx === 0 && dz === 0) {
      const rawX = goalX - fromX;
      const rawZ = goalZ - fromZ;
      const len = Math.hypot(rawX, rawZ) || 1;
      return { dx: rawX / len, dz: rawZ / len };
    }
    return { dx, dz };
  }

  private buildFlowField(goalX: number, goalZ: number): Float32Array {
    const total = this.cols * this.rows;
    const dist = new Float32Array(total);
    dist.fill(1e9);

    const freeGoal = this.findNearestFreeWorld(goalX, goalZ);
    const goalCell = this.worldToCell(freeGoal.x, freeGoal.z);
    const startIdx = goalCell.r * this.cols + goalCell.c;
    dist[startIdx] = 0;

    const queue = new Int32Array(total * 2);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;

    const dirs = [
      [-1, 0, 1],
      [1, 0, 1],
      [0, -1, 1],
      [0, 1, 1],
      [-1, -1, 1.414],
      [1, -1, 1.414],
      [-1, 1, 1.414],
      [1, 1, 1.414],
    ] as const;

    while (head < tail) {
      const curr = queue[head++]!;
      const cr = Math.floor(curr / this.cols);
      const cc = curr % this.cols;
      const cd = dist[curr]!;

      for (let i = 0; i < dirs.length; i++) {
        const [dc, dr, cost] = dirs[i]!;
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
        const nIdx = nr * this.cols + nc;
        if (this.blocked[nIdx] === 1) continue;
        const nd = cd + cost;
        if (nd < dist[nIdx]!) {
          dist[nIdx] = nd;
          queue[tail++] = nIdx;
        }
      }
    }

    const field = new Float32Array(total * 2);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        let bestD = dist[idx]!;
        let bestDx = 0;
        let bestDz = 0;
        for (let i = 0; i < dirs.length; i++) {
          const [dc, dr] = dirs[i]!;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
          const nd = dist[nr * this.cols + nc]!;
          if (nd < bestD) {
            bestD = nd;
            bestDx = dc;
            bestDz = dr;
          }
        }
        const len = Math.hypot(bestDx, bestDz);
        if (len > 0) {
          field[idx * 2] = bestDx / len;
          field[idx * 2 + 1] = bestDz / len;
        }
      }
    }
    return field;
  }

  /** Rebuilds 1m spatial hash for O(1) neighbour lookups */
  public updateSpatialHash(agents: readonly AgentSpatialEntry[]): void {
    this.spatialBuckets.clear();
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]!;
      const key = this.hashCell(Math.floor(a.x), Math.floor(a.z));
      let bucket = this.spatialBuckets.get(key);
      if (!bucket) {
        bucket = [];
        this.spatialBuckets.set(key, bucket);
      }
      bucket.push(a);
    }
  }

  private hashCell(gx: number, gz: number): number {
    return ((gx + 64) << 8) | ((gz + 64) & 0xff);
  }

  public countAgentsNear(x: number, z: number, radius: number, excludeId?: string): number {
    let count = 0;
    const rSq = radius * radius;
    const gx0 = Math.floor(x - radius);
    const gx1 = Math.floor(x + radius);
    const gz0 = Math.floor(z - radius);
    const gz1 = Math.floor(z + radius);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = this.spatialBuckets.get(this.hashCell(gx, gz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const other = bucket[i]!;
          if (other.id === excludeId) continue;
          const dx = other.x - x;
          const dz = other.z - z;
          if (dx * dx + dz * dz <= rSq) count++;
        }
      }
    }
    return count;
  }

  /** ORCA-lite 6-vector velocity obstacle sample + wall slide */
  public steerAndMove(
    agentId: string,
    x: number,
    z: number,
    desiredDx: number,
    desiredDz: number,
    speed: number,
    dt: number,
  ): { x: number; z: number; vx: number; vz: number } {
    let sepX = 0;
    let sepZ = 0;
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    const minDist = this.personalRadius * 2.1;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const bucket = this.spatialBuckets.get(this.hashCell(gx + ox, gz + oz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const other = bucket[i]!;
          if (other.id === agentId) continue;
          const dx = x - other.x;
          const dz = z - other.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.0001 && dist < minDist) {
            const push = (minDist - dist) / minDist;
            sepX += (dx / dist) * push * 1.4;
            sepZ += (dz / dist) * push * 1.4;
          }
        }
      }
    }

    let dirX = desiredDx + sepX;
    let dirZ = desiredDz + sepZ;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) {
      dirX /= len;
      dirZ /= len;
    }

    const stepX = dirX * speed * dt;
    const stepZ = dirZ * speed * dt;
    let nextX = x + stepX;
    let nextZ = z + stepZ;

    if (this.isBlockedWorld(nextX, nextZ)) {
      // Try sliding along X or Z independently
      if (!this.isBlockedWorld(x + stepX, z)) {
        nextX = x + stepX;
        nextZ = z;
      } else if (!this.isBlockedWorld(x, z + stepZ)) {
        nextX = x;
        nextZ = z + stepZ;
      } else {
        const freed = this.findNearestFreeWorld(x, z);
        nextX = freed.x;
        nextZ = freed.z;
      }
    }

    nextX = Math.max(this.minX + 0.45, Math.min(this.maxX - 0.45, nextX));
    nextZ = Math.max(this.minZ + 0.45, Math.min(this.maxZ - 0.45, nextZ));

    return {
      x: nextX,
      z: nextZ,
      vx: (nextX - x) / Math.max(0.001, dt),
      vz: (nextZ - z) / Math.max(0.001, dt),
    };
  }
}
