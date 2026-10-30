/**
 * YouTube Playables SDK v1 Wrapper & Standalone Browser Shim
 * Exercises gameReady, firstFrameReady, onPause, onResume, isAudioEnabled,
 * onAudioEnabledChange, saveData, loadData, sendScore.
 */

export interface PlayablesSDK {
  firstFrameReady(): void;
  gameReady(): void;
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  saveData(data: string): Promise<void>;
  loadData(): Promise<string | null>;
  sendScore(score: number): Promise<void>;
  getLog(): readonly string[];
}

declare global {
  interface Window {
    ytgame?: {
      game?: {
        firstFrameReady?: () => void;
        gameReady?: () => void;
        saveData?: (data: string) => Promise<void>;
        loadData?: () => Promise<string>;
      };
      system?: {
        isAudioEnabled?: () => boolean;
        onAudioEnabledChange?: (cb: (isAudioEnabled: boolean) => void) => void;
        onPause?: (cb: () => void) => void;
        onResume?: (cb: () => void) => void;
      };
      engagement?: {
        sendScore?: (req: { value: number }) => Promise<void>;
      };
    };
  }
}

const CLOUD_STORAGE_KEY = 'minimart_evolved_yt_cloud_v3';

class PlayablesShim implements PlayablesSDK {
  private audioEnabled = true;
  private audioCallbacks = new Set<(enabled: boolean) => void>();
  private pauseCallbacks = new Set<() => void>();
  private resumeCallbacks = new Set<() => void>();
  private callLog: string[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const yt = window.ytgame;
      if (yt?.system?.isAudioEnabled) {
        this.audioEnabled = yt.system.isAudioEnabled();
      }
      if (yt?.system?.onAudioEnabledChange) {
        yt.system.onAudioEnabledChange((enabled: boolean) => {
          this.audioEnabled = enabled;
          this.log(`onAudioEnabledChange(${enabled})`);
          for (const cb of this.audioCallbacks) cb(enabled);
        });
      }
      if (yt?.system?.onPause) {
        yt.system.onPause(() => {
          this.log('onPause(ytgame)');
          for (const cb of this.pauseCallbacks) cb();
        });
      }
      if (yt?.system?.onResume) {
        yt.system.onResume(() => {
          this.log('onResume(ytgame)');
          for (const cb of this.resumeCallbacks) cb();
        });
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.triggerPause();
        } else {
          this.triggerResume();
        }
      });
    }
  }

  private log(entry: string): void {
    this.callLog.push(`${new Date().toISOString()} ${entry}`);
    if (this.callLog.length > 50) this.callLog.shift();
  }

  public firstFrameReady(): void {
    this.log('firstFrameReady');
    window.ytgame?.game?.firstFrameReady?.();
  }

  public gameReady(): void {
    this.log('gameReady');
    window.ytgame?.game?.gameReady?.();
  }

  public isAudioEnabled(): boolean {
    this.log('isAudioEnabled');
    if (window.ytgame?.system?.isAudioEnabled) {
      return window.ytgame.system.isAudioEnabled();
    }
    return this.audioEnabled;
  }

  public setSimulatedAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    this.log(`setSimulatedAudioEnabled(${enabled})`);
    for (const cb of this.audioCallbacks) cb(enabled);
  }

  public onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    this.audioCallbacks.add(cb);
    return () => this.audioCallbacks.delete(cb);
  }

  public onPause(cb: () => void): () => void {
    this.pauseCallbacks.add(cb);
    return () => this.pauseCallbacks.delete(cb);
  }

  public onResume(cb: () => void): () => void {
    this.resumeCallbacks.add(cb);
    return () => this.resumeCallbacks.delete(cb);
  }

  public triggerPause(): void {
    this.log('triggerPause');
    for (const cb of this.pauseCallbacks) cb();
  }

  public triggerResume(): void {
    this.log('triggerResume');
    for (const cb of this.resumeCallbacks) cb();
  }

  public async saveData(data: string): Promise<void> {
    this.log(`saveData(${data.length}B)`);
    if (window.ytgame?.game?.saveData) {
      await window.ytgame.game.saveData(data);
      return;
    }
    try {
      localStorage.setItem(CLOUD_STORAGE_KEY, data);
    } catch {
      // Storage quota fallback handled by SaveManager
    }
  }

  public async loadData(): Promise<string | null> {
    this.log('loadData');
    if (window.ytgame?.game?.loadData) {
      try {
        const d = await window.ytgame.game.loadData();
        if (d) return d;
      } catch {
        // Fallback to localStorage
      }
    }
    try {
      return localStorage.getItem(CLOUD_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public async sendScore(score: number): Promise<void> {
    this.log(`sendScore(${Math.floor(score)})`);
    if (window.ytgame?.engagement?.sendScore) {
      await window.ytgame.engagement.sendScore({ value: Math.floor(score) });
    }
  }

  public getLog(): readonly string[] {
    return this.callLog;
  }
}

export const playablesSDK = new PlayablesShim();
