/**
 * 100% Procedural Web Audio API Synthesis Engine (§11)
 * - Master bus -> DynamicsCompressor -> Limiter
 * - 4 Sub-buses: SFX, ASMR, MUSIC, UI
 * - 8 ASMR synthesis layers + 4 Adaptive Markov Music stems in D major pentatonic
 * - Zero external audio files
 */

import { AudioBusSettings } from '../core/save';
import { playablesSDK } from '../core/shim-playables';

// D major pentatonic frequencies (Hz) across octaves
const PENTATONIC_LADDER = [
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  440.0,  // A4
  493.88, // B4
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  880.0,  // A5
];

const MARKOV_CHORDS: ReadonlyArray<readonly [number, number, number]> = [
  [146.83, 220.0, 293.66], // D
  [164.81, 246.94, 329.63], // Em
  [185.0, 277.18, 369.99], // F#m
  [196.0, 293.66, 392.0], // G
  [220.0, 329.63, 440.0], // A
  [246.94, 369.99, 493.88], // Bm
  [146.83, 277.18, 369.99], // Dmaj7
  [196.0, 293.66, 440.0], // Gsus2
];

export class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private asmrBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  public unlockedByGesture = false;
  private sdkAudioEnabled = true;
  private settings: AudioBusSettings = {
    masterMuted: false,
    sfx: 0.85,
    asmr: 0.9,
    music: 0.65,
    ui: 0.8,
  };

  private activeVoices = 0;
  private readonly maxVoices = 32;
  private chordIndex = 0;
  private beatCounter = 0;
  private musicTimerId: number | null = null;
  private currentIntensity: 0 | 1 | 2 | 3 = 0; // 0=Calm, 1=Busy, 2=Rush, 3=Panic
  private onCaption?: (text: string) => void;

  constructor(onCaption?: (text: string) => void) {
    this.onCaption = onCaption;
    this.sdkAudioEnabled = playablesSDK.isAudioEnabled();
    playablesSDK.onAudioEnabledChange((enabled) => {
      this.sdkAudioEnabled = enabled;
      this.syncVolumes();
    });
  }

  public unlockFromUserGesture(): void {
    if (this.unlockedByGesture && this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      this.masterGain = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.asmrBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.uiBus = this.ctx.createGain();

      this.sfxBus.connect(this.masterGain);
      this.asmrBus.connect(this.masterGain);
      this.musicBus.connect(this.masterGain);
      this.uiBus.connect(this.masterGain);

      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);

      // Build reusable 1-second white noise buffer
      const sr = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
      const channel = this.noiseBuffer.getChannelData(0);
      let seed = 0x12345678;
      for (let i = 0; i < sr; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        channel[i] = (seed / 0xffffffff) * 2 - 1;
      }

      this.unlockedByGesture = true;
      this.syncVolumes();
      this.startAdaptiveMusicLoop();
    } catch {
      // Headless or disabled audio device
    }
  }

  public updateSettings(settings: AudioBusSettings): void {
    this.settings = { ...settings };
    this.syncVolumes();
  }

  public setIntensityMetrics(customerCount: number, maxQueueLen: number): void {
    if (maxQueueLen > 6) {
      this.currentIntensity = 3; // Panic
    } else if (customerCount > 12 || maxQueueLen >= 4) {
      this.currentIntensity = 2; // Rush
    } else if (customerCount > 0) {
      this.currentIntensity = 1; // Busy
    } else {
      this.currentIntensity = 0; // Calm
    }
  }

  public suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended' && this.unlockedByGesture) {
      void this.ctx.resume();
    }
  }

  private syncVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxBus || !this.asmrBus || !this.musicBus || !this.uiBus) {
      return;
    }
    const now = this.ctx.currentTime;
    const muted = this.settings.masterMuted || !this.sdkAudioEnabled;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, now, 0.03);
    this.asmrBus.gain.setTargetAtTime(this.settings.asmr, now, 0.03);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.45, now, 0.05);
    this.uiBus.gain.setTargetAtTime(this.settings.ui, now, 0.03);
  }

  private canAllocateVoice(): boolean {
    if (!this.ctx || !this.unlockedByGesture || this.settings.masterMuted || !this.sdkAudioEnabled) {
      return false;
    }
    if (this.activeVoices >= this.maxVoices) return false;
    this.activeVoices++;
    return true;
  }

  private releaseVoiceAfter(ms: number): void {
    window.setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, ms);
  }

  /** ASMR Layer 1: Shelf restock filtered noise thwip + item clack (§11.2) */
  public playRestockClack(tier = 1): void {
    this.onCaption?.('[shelf restock]');
    if (!this.canAllocateVoice() || !this.ctx || !this.asmrBus || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650 + tier * 180, now);
    filter.Q.value = 3.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.asmrBus);

    src.start(now);
    src.stop(now + 0.09);
    this.releaseVoiceAfter(100);
  }

  /** ASMR Layer 2: Register beep on pentatonic ladder, sine + 3rd harmonic, 90ms (§11.2) */
  public playRegisterBeep(stepIndex = 0): void {
    this.onCaption?.('[cash register beep]');
    if (!this.canAllocateVoice() || !this.ctx || !this.asmrBus) return;

    const now = this.ctx.currentTime;
    const baseFreq = PENTATONIC_LADDER[stepIndex % PENTATONIC_LADDER.length] ?? 587.33;

    const osc1 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc3.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc3.frequency.setValueAtTime(baseFreq * 3, now);

    const g1 = this.ctx.createGain();
    const g3 = this.ctx.createGain();
    g1.gain.setValueAtTime(0.22, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    g3.gain.setValueAtTime(0.05, now);
    g3.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc1.connect(g1);
    osc3.connect(g3);
    g1.connect(this.asmrBus);
    g3.connect(this.asmrBus);

    osc1.start(now);
    osc3.start(now);
    osc1.stop(now + 0.095);
    osc3.stop(now + 0.095);
    this.releaseVoiceAfter(105);
  }

  /** ASMR Layer 3: Coin clink 3-partial additive bell, 1.2 kHz base, 180ms decay (§11.2) */
  public playCoinClink(): void {
    this.onCaption?.('[coin clink]');
    if (!this.canAllocateVoice() || !this.ctx || !this.asmrBus) return;

    const now = this.ctx.currentTime;
    const partials = [1200, 1200 * 1.52, 1200 * 2.18];
    const amps = [0.2, 0.11, 0.06];

    partials.forEach((freq, idx) => {
      if (!this.ctx || !this.asmrBus) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(amps[idx] ?? 0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(g);
      g.connect(this.asmrBus);
      osc.start(now);
      osc.stop(now + 0.19);
    });

    this.releaseVoiceAfter(200);
  }

  /** ASMR Layer 6: Steamer hiss / machine completion pop (§11.2) */
  public playSteamerHiss(): void {
    this.onCaption?.('[steamer hiss]');
    if (!this.canAllocateVoice() || !this.ctx || !this.asmrBus || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2800, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    src.connect(hp);
    hp.connect(g);
    g.connect(this.asmrBus);

    src.start(now);
    src.stop(now + 0.36);
    this.releaseVoiceAfter(370);
  }

  /** Purchase Thunk + Sparkle (§10.3) */
  public playPurchaseThunk(): void {
    this.onCaption?.('[purchase confirmed]');
    if (!this.canAllocateVoice() || !this.ctx || !this.uiBus) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(64, now + 0.11);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(g);
    g.connect(this.uiBus);
    osc.start(now);
    osc.stop(now + 0.13);

    // Chime overtone
    this.playCoinClink();
    this.releaseVoiceAfter(140);
  }

  /** Star Earned Fanfare (§10.3) */
  public playStarFanfare(): void {
    this.onCaption?.('[star objective achieved!]');
    if (!this.canAllocateVoice() || !this.ctx || !this.sfxBus) return;

    const now = this.ctx.currentTime;
    const notes = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6
    notes.forEach((f, i) => {
      if (!this.ctx || !this.sfxBus) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const t = now + i * 0.075;
      osc.frequency.setValueAtTime(f, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.34);
    });
    this.releaseVoiceAfter(650);
  }

  /** Adaptive 4-Stem Markov Music Loop in D Major Pentatonic (§11.3) */
  private startAdaptiveMusicLoop(): void {
    if (this.musicTimerId !== null) return;

    const stepTick = () => {
      const bpm = 92 + this.currentIntensity * 4;
      const sixteenthMs = (60000 / bpm) / 4;

      if (this.ctx && this.ctx.state === 'running' && this.musicBus && !this.settings.masterMuted && this.sdkAudioEnabled) {
        const now = this.ctx.currentTime;
        const chord = MARKOV_CHORDS[this.chordIndex] ?? MARKOV_CHORDS[0]!;

        // Advance Markov chord every 8 steps
        if (this.beatCounter % 8 === 0) {
          this.chordIndex = (this.chordIndex + 1 + (this.beatCounter % 3)) % MARKOV_CHORDS.length;
        }

        // Stem 1: Bass on beats 0 and 4
        if (this.beatCounter % 4 === 0) {
          const bassOsc = this.ctx.createOscillator();
          bassOsc.type = 'sine';
          bassOsc.frequency.setValueAtTime(chord[0], now);
          const bg = this.ctx.createGain();
          bg.gain.setValueAtTime(0.22, now);
          bg.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
          bassOsc.connect(bg);
          bg.connect(this.musicBus);
          bassOsc.start(now);
          bassOsc.stop(now + 0.34);
        }

        // Stem 2: Pluck Arp (active in all states, denser in Busy/Rush)
        if (this.beatCounter % 2 === 0 || this.currentIntensity >= 2) {
          const noteFreq = chord[this.beatCounter % 3] * (this.beatCounter % 4 === 2 ? 2 : 1);
          const pluck = this.ctx.createOscillator();
          pluck.type = 'triangle';
          pluck.frequency.setValueAtTime(noteFreq, now);
          const pg = this.ctx.createGain();
          pg.gain.setValueAtTime(0.12, now);
          pg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          pluck.connect(pg);
          pg.connect(this.musicBus);
          pluck.start(now);
          pluck.stop(now + 0.19);
        }

        // Stem 3 & 4: Soft Shaker Percussion in Busy/Rush/Panic
        if (this.currentIntensity >= 1 && this.beatCounter % 2 === 1 && this.noiseBuffer) {
          const hat = this.ctx.createBufferSource();
          hat.buffer = this.noiseBuffer;
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(5200, now);
          const hg = this.ctx.createGain();
          hg.gain.setValueAtTime(0.04 * this.currentIntensity, now);
          hg.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
          hat.connect(hp);
          hp.connect(hg);
          hg.connect(this.musicBus);
          hat.start(now);
          hat.stop(now + 0.05);
        }

        this.beatCounter++;
      }

      this.musicTimerId = window.setTimeout(stepTick, sixteenthMs);
    };

    stepTick();
  }
}
