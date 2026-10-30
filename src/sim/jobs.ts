/**
 * Contract-Net Auction JobBroker & No-Wait Rule (§7.2)
 * Kills F2 (pile-ups) and F3 (waiting for full carry stack).
 */

import { StaffRole } from '../core/save';

export type JobType =
  | 'SERVE_TILL'
  | 'RESTOCK_SHELF'
  | 'HARVEST_CROP'
  | 'FEED_ANIMAL'
  | 'COLLECT_ANIMAL'
  | 'LOAD_MACHINE'
  | 'COLLECT_MACHINE'
  | 'REPAIR_MACHINE'
  | 'INTERCEPT_THIEF';

export interface SimJob {
  id: string;
  type: JobType;
  stationId: string;
  targetX: number;
  targetZ: number;
  requiredRoles: StaffRole[];
  basePriority: number;
  urgencyBonus: number;
  productId?: string;
  claimedBy: string | null;
  claimedAtSimTime: number;
}

export interface StaffBidder {
  id: string;
  role: StaffRole;
  tier: 1 | 2 | 3;
  x: number;
  z: number;
  carryingItems: string[];
  carryCapacity: number;
  lastStationId: string | null;
  personality: [number, number, number]; // [diligence, chattiness, tidiness]
}

export class JobBroker {
  private jobs = new Map<string, SimJob>();
  private stationWorkers = new Map<string, Set<string>>();
  public readonly maxConcurrentWorkersPerStation = 2;
  public autoReleasedReservationCount = 0;

  public clear(): void {
    this.jobs.clear();
    this.stationWorkers.clear();
  }

  public getOpenJobs(): SimJob[] {
    return Array.from(this.jobs.values());
  }

  public upsertJob(job: Omit<SimJob, 'claimedBy' | 'claimedAtSimTime'>): void {
    const existing = this.jobs.get(job.id);
    if (existing) {
      existing.basePriority = job.basePriority;
      existing.urgencyBonus = job.urgencyBonus;
      existing.targetX = job.targetX;
      existing.targetZ = job.targetZ;
      existing.productId = job.productId;
    } else {
      this.jobs.set(job.id, {
        ...job,
        claimedBy: null,
        claimedAtSimTime: 0,
      });
    }
  }

  public removeJob(jobId: string): void {
    const existing = this.jobs.get(jobId);
    if (existing && existing.claimedBy) {
      this.releaseStationWorker(existing.stationId, existing.claimedBy);
    }
    this.jobs.delete(jobId);
  }

  public releaseClaim(jobId: string, staffId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.claimedBy === staffId) {
      job.claimedBy = null;
      job.claimedAtSimTime = 0;
      this.releaseStationWorker(job.stationId, staffId);
    }
  }

  private releaseStationWorker(stationId: string, staffId: string): void {
    const set = this.stationWorkers.get(stationId);
    if (set) {
      set.delete(staffId);
    }
  }

  public getStationWorkerCount(stationId: string): number {
    return this.stationWorkers.get(stationId)?.size ?? 0;
  }

  /** Audit stale claims (> 8s without completion) and release automatically (§7.1) */
  public auditStaleClaims(simTime: number, onStaleRelease?: (staffId: string) => void): void {
    for (const job of this.jobs.values()) {
      if (job.claimedBy && simTime - job.claimedAtSimTime > 8.0) {
        const prevStaff = job.claimedBy;
        job.claimedBy = null;
        job.claimedAtSimTime = 0;
        this.releaseStationWorker(job.stationId, prevStaff);
        this.autoReleasedReservationCount++;
        onStaleRelease?.(prevStaff);
      }
    }
  }

  public canRolePerformJob(role: StaffRole, tier: 1 | 2 | 3, job: SimJob): boolean {
    // Tier 3 Managers can perform any store role (§7.2)
    if (tier === 3) return true;
    return job.requiredRoles.includes(role);
  }

  /**
   * Contract-Net Auction (§7.2):
   * Scores all open jobs for idle staff, runs global greedy assignment,
   * and sets reservation locks respecting maxConcurrentWorkers = 2.
   */
  public runAuction(
    idleStaff: readonly StaffBidder[],
    simTime: number,
    countNearbyAgents: (x: number, z: number, radius: number, excludeId: string) => number,
  ): Map<string, SimJob> {
    const assignments = new Map<string, SimJob>();
    if (idleStaff.length === 0 || this.jobs.size === 0) return assignments;

    interface Bid {
      staffId: string;
      job: SimJob;
      score: number;
    }

    const bids: Bid[] = [];

    for (let s = 0; s < idleStaff.length; s++) {
      const bidder = idleStaff[s]!;
      for (const job of this.jobs.values()) {
        if (job.claimedBy !== null) continue;
        if (!this.canRolePerformJob(bidder.role, bidder.tier, job)) continue;

        const currentStationWorkers = this.getStationWorkerCount(job.stationId);
        if (currentStationWorkers >= this.maxConcurrentWorkersPerStation) continue;

        // Enforce item matching when restocking or loading machines
        if (job.type === 'RESTOCK_SHELF' || job.type === 'LOAD_MACHINE' || job.type === 'FEED_ANIMAL') {
          if (bidder.carryingItems.length > 0 && job.productId) {
            if (!bidder.carryingItems.includes(job.productId)) continue;
          }
        }

        const dist = Math.hypot(job.targetX - bidder.x, job.targetZ - bidder.z);
        const affinityBonus = bidder.lastStationId === job.stationId ? 14 : 0;
        const nearbyCongestion = countNearbyAgents(job.targetX, job.targetZ, 1.6, bidder.id);
        const congestionPenalty = nearbyCongestion * 25;
        const personalityMultiplier = 0.92 + bidder.personality[0] * 0.16;

        const score =
          (job.basePriority +
            job.urgencyBonus -
            dist / 12 +
            affinityBonus -
            congestionPenalty) *
          personalityMultiplier;

        bids.push({ staffId: bidder.id, job, score });
      }
    }

    // Global greedy assignment sorted descending by bid score
    bids.sort((a, b) => b.score - a.score);

    const assignedStaff = new Set<string>();
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i]!;
      if (assignedStaff.has(bid.staffId)) continue;
      if (bid.job.claimedBy !== null) continue;
      if (this.getStationWorkerCount(bid.job.stationId) >= this.maxConcurrentWorkersPerStation) {
        continue;
      }

      bid.job.claimedBy = bid.staffId;
      bid.job.claimedAtSimTime = simTime;
      let set = this.stationWorkers.get(bid.job.stationId);
      if (!set) {
        set = new Set();
        this.stationWorkers.set(bid.job.stationId, set);
      }
      set.add(bid.staffId);
      assignedStaff.add(bid.staffId);
      assignments.set(bid.staffId, bid.job);
    }

    return assignments;
  }
}

/**
 * The No-Wait Rule (§7.2, F3 fix, Acceptance Test T7):
 * A staff member picking up from a batch source takes min(available, freeCarrySlots)
 * and departs immediately without waiting to fill carry capacity.
 */
export function executeBatchPickupNoWait(
  availableAtSource: number,
  currentCarryCount: number,
  carryCapacity: number,
): { taken: number; remainingAtSource: number; shouldDepartImmediately: boolean } {
  const freeCarrySlots = Math.max(0, carryCapacity - currentCarryCount);
  const taken = Math.min(availableAtSource, freeCarrySlots);
  return {
    taken,
    remainingAtSource: availableAtSource - taken,
    shouldDepartImmediately: taken > 0 || freeCarrySlots === 0 || availableAtSource === 0,
  };
}
