// READS FROM SIM ONLY — never cache authoritative values (§6.3)

import React, { useEffect, useRef, useState } from 'react';
import {
  AcceptanceTestResult,
  runAll22AcceptanceTests,
} from './core/acceptance-tests';
import {
  ColorBlindMode,
  GraphicsPreset,
  LocaleCode,
  StaffRole,
  UpgradeTrack,
  createDefaultSave,
  loadSaveWithRecovery,
  persistSave,
} from './core/save';
import { playablesSDK } from './core/shim-playables';
import { LOCALES } from './content/i18n';
import { MARTS, PRESTIGE_MODIFIERS } from './content/marts';
import {
  STAFF_CLASSES,
  UPGRADE_TRACKS,
  computeHireCost,
  computeUpgradeCost,
  computeWagePerMin,
} from './content/upgrades';
import { ProceduralAudioEngine } from './audio/engine';
import { MartSceneManager } from './render/scene-manager';
import { SimWorld } from './sim/world';

type ActiveModal = 'none' | 'upgrades' | 'staff' | 'map' | 'settings' | 'qa';

interface FloatingPop {
  id: number;
  text: string;
  color: string;
  xPct: number;
  yPct: number;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<SimWorld | null>(null);
  const sceneRef = useRef<MartSceneManager | null>(null);
  const audioRef = useRef<ProceduralAudioEngine | null>(null);

  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused'>('title');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [perfOverlayOpen, setPerfOverlayOpen] = useState(false);
  const [, setUiTick] = useState(0); // Forces React re-render to read live from simRef.current

  const [floatingPops, setFloatingPops] = useState<FloatingPop[]>([]);
  const [toastBanner, setToastBanner] = useState<{ text: string; tone: string } | null>(null);
  const [captionText, setCaptionText] = useState<string>('');
  const [screenDipPx, setScreenDipPx] = useState(0);
  const [offlineCard, setOfflineCard] = useState<{ seconds: number; earnings: number } | null>(null);
  const [qaResults, setQaResults] = useState<AcceptanceTestResult[] | null>(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [hudDimmed, setHudDimmed] = useState(false);
  const [virtualStick, setVirtualStick] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);

  const lastInputTimeRef = useRef<number>(Date.now());
  const popSeqRef = useRef(0);
  const heldKeysRef = useRef<Set<string>>(new Set());

  const markUserActivity = () => {
    lastInputTimeRef.current = Date.now();
    if (hudDimmed) setHudDimmed(false);
    audioRef.current?.unlockFromUserGesture();
  };

  // Initialize Simulation, Three.js SceneManager, and Procedural Audio once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const initialSave = createDefaultSave();
    const sim = new SimWorld(initialSave);
    simRef.current = sim;

    const audio = new ProceduralAudioEngine((cap) => {
      if (simRef.current?.save.settings.a11y.subtitles) {
        setCaptionText(cap);
      }
    });
    audioRef.current = audio;

    const sceneMgr = new MartSceneManager(mount, sim);
    sceneRef.current = sceneMgr;

    playablesSDK.firstFrameReady();

    // Load persisted save asynchronously
    void loadSaveWithRecovery().then((res) => {
      sim.save = res.save;
      sim.loadMart(res.save.progress.martIndex);
      audio.updateSettings(res.save.settings.audio);
      sceneMgr.applyGraphicsPreset(res.save.settings.graphics);
      if (res.recoveredFromSnapshot) {
        setToastBanner({
          text: 'Save checksum mismatch detected — restored cleanly from backup snapshot.',
          tone: '#FFC65C',
        });
      }
      if (res.offlineEarnings > 0) {
        setOfflineCard({ seconds: res.offlineSeconds, earnings: res.offlineEarnings });
      }
      playablesSDK.gameReady();
      setUiTick((n) => n + 1);
    });

    // Subscribe to SimWorld Events for Audio, Floating Pops, Screen Dip & Haptics
    const unsubs = [
      sim.events.on('DEPOSIT_ITEM', ({ tier }) => {
        audio.playRestockClack(tier);
      }),
      sim.events.on('REGISTER_SCAN', ({ stepIndex }) => {
        audio.playRegisterBeep(stepIndex);
      }),
      sim.events.on('SALE_COMPLETE', ({ amount }) => {
        audio.playCoinClink();
        if (sim.save.settings.haptics && navigator.vibrate) {
          navigator.vibrate(12);
        }
        popSeqRef.current++;
        const id = popSeqRef.current;
        setFloatingPops((prev) => [
          ...prev.slice(-8),
          {
            id,
            text: `+$${amount}`,
            color: '#F2B33D',
            xPct: 45 + ((id * 7) % 14),
            yPct: 58 - ((id * 5) % 12),
          },
        ]);
        window.setTimeout(() => {
          setFloatingPops((prev) => prev.filter((p) => p.id !== id));
        }, 950);
      }),
      sim.events.on('CASH_COLLECT', ({ amount }) => {
        audio.playCoinClink();
        popSeqRef.current++;
        const id = popSeqRef.current;
        setFloatingPops((prev) => [
          ...prev.slice(-8),
          {
            id,
            text: `+$${amount}`,
            color: '#4FA85C',
            xPct: 48,
            yPct: 45,
          },
        ]);
        window.setTimeout(() => {
          setFloatingPops((prev) => prev.filter((p) => p.id !== id));
        }, 900);
      }),
      sim.events.on('PURCHASE_SUCCESS', ({ label }) => {
        audio.playPurchaseThunk();
        if (sim.save.settings.haptics && navigator.vibrate) {
          navigator.vibrate(25);
        }
        if (!sim.save.settings.a11y.reduceMotion) {
          setScreenDipPx(2);
          window.setTimeout(() => setScreenDipPx(0), 140);
        }
        setToastBanner({ text: label, tone: '#4FA85C' });
        persistSave(sim.save);
      }),
      sim.events.on('MACHINE_COMPLETE', () => {
        audio.playSteamerHiss();
      }),
      sim.events.on('STAR_EARNED', ({ star, label }) => {
        audio.playStarFanfare();
        if (!sim.save.settings.a11y.reduceMotion) {
          setScreenDipPx(3);
          window.setTimeout(() => setScreenDipPx(0), 180);
        }
        setToastBanner({ text: `★${star} Unlocked: ${label}!`, tone: '#F2B33D' });
        persistSave(sim.save);
      }),
      sim.events.on('STAFF_HIRED', ({ name, role, free }) => {
        if (free) {
          audio.playStarFanfare();
          setToastBanner({
            text: `Free Helper Arrived: ${name} (${role.toUpperCase()})!`,
            tone: '#2E9E9B',
          });
        }
      }),
      sim.events.on('THIEF_TELEGRAPH', () => {
        setToastBanner({
          text: 'Shifty Thief spotted at entrance! Tap him or collect cash!',
          tone: '#E8503A',
        });
      }),
      sim.events.on('THIEF_CAUGHT', ({ by }) => {
        audio.playStarFanfare();
        setToastBanner({
          text: by === 'guard' ? 'Security Guard intercepted the thief!' : 'Caught the thief!',
          tone: '#4FA85C',
        });
      }),
    ];

    // Playables SDK pause / resume hooks (§4.2)
    const unsubPause = playablesSDK.onPause(() => {
      sim.paused = true;
      audio.suspend();
      persistSave(sim.save);
      setGameState((prev) => (prev === 'playing' ? 'paused' : prev));
    });
    const unsubResume = playablesSDK.onResume(() => {
      window.setTimeout(() => {
        audio.resume();
      }, 300);
    });

    // Fixed 60 Hz Simulation Accumulator + Software-WebGL-Safe Render Loop
    let frameId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const FIXED_DT = 1 / 60;
    let uiRefreshAccum = 0;

    function afterDraw(cb: () => void) {
      const gl = sceneMgr.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const now = performance.now();
      const rawDt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      sceneMgr.frameTimeMs = rawDt * 1000;
      sceneMgr.fps = sceneMgr.fps * 0.9 + (1 / Math.max(0.001, rawDt)) * 0.1;

      // Update keyboard movement intent
      const keys = heldKeysRef.current;
      let kx = 0;
      let kz = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) kz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) kz += 1;
      if (kx !== 0 || kz !== 0) {
        const len = Math.hypot(kx, kz);
        sim.inputMoveX = kx / len;
        sim.inputMoveZ = kz / len;
        sim.pointerTarget = null;
      } else if (!virtualStick) {
        sim.inputMoveX = 0;
        sim.inputMoveZ = 0;
      }

      accumulator += rawDt;
      let subSteps = 0;
      while (accumulator >= FIXED_DT && subSteps < 4) {
        sim.step(FIXED_DT);
        accumulator -= FIXED_DT;
        subSteps++;
      }

      // Update adaptive music intensity
      const maxQ = sim.tills.reduce((m, t) => Math.max(m, t.queueCustomerIds.length), 0);
      audio.setIntensityMetrics(sim.customers.length, maxQ);

      sceneMgr.updateAndRender(rawDt);

      uiRefreshAccum += rawDt;
      if (uiRefreshAccum >= 0.12) {
        uiRefreshAccum = 0;
        if (Date.now() - lastInputTimeRef.current > 6000) {
          setHudDimmed(true);
        }
        setUiTick((n) => (n + 1) % 1000000);
      }

      if (sceneMgr.isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    const onResize = () => {
      if (!mount) return;
      sceneMgr.resize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      unsubs.forEach((u) => u());
      unsubPause();
      unsubResume();
      sceneMgr.dispose();
    };
  }, []);

  // Keyboard shortcuts (`WASD`, `Space` Manager Cam, `P`/`Escape` Pause, `H` Hide Dock, `~` Perf Overlay)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      markUserActivity();
      heldKeysRef.current.add(e.code);

      if (gameState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        if (simRef.current) simRef.current.paused = false;
        setGameState('playing');
        return;
      }

      if (e.code === 'Backquote') {
        setPerfOverlayOpen((v) => !v);
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (activeModal !== 'none') {
          setActiveModal('none');
        } else if (gameState === 'playing') {
          if (simRef.current) simRef.current.paused = true;
          audioRef.current?.suspend();
          setGameState('paused');
        } else if (gameState === 'paused') {
          if (simRef.current) simRef.current.paused = false;
          audioRef.current?.resume();
          setGameState('playing');
        }
      } else if (e.code === 'Space' && gameState === 'playing') {
        e.preventDefault();
        if (sceneRef.current) {
          sceneRef.current.managerCamActive = !sceneRef.current.managerCamActive;
          setUiTick((n) => n + 1);
        }
      } else if (e.code === 'KeyH') {
        setDockCollapsed((c) => !c);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.code);
    };

    const onBlur = () => {
      heldKeysRef.current.clear();
      if (simRef.current) {
        simRef.current.inputMoveX = 0;
        simRef.current.inputMoveZ = 0;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gameState, activeModal]);

  // Clear toast after 3.2s
  useEffect(() => {
    if (!toastBanner) return;
    const id = window.setTimeout(() => setToastBanner(null), 3200);
    return () => clearTimeout(id);
  }, [toastBanner]);

  const sim = simRef.current;
  const sceneMgr = sceneRef.current;
  const save = sim?.save ?? createDefaultSave();
  const localeBundle = LOCALES[save.settings.locale] ?? LOCALES.en;
  const t = localeBundle.strings;
  const a11y = save.settings.a11y;

  // Semantic palette tokens (with Colour-blind swap Tomato <-> Berry per §5.7)
  const dangerColor = a11y.colorBlindMode !== 'none' ? '#8E5BC9' : '#E8503A';
  const premiumColor = a11y.colorBlindMode !== 'none' ? '#E8503A' : '#8E5BC9';

  // Canvas pointer handlers (Virtual Stick + Floor Tap to Move / Unlock Plot / Catch Thief)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    markUserActivity();
    if (gameState !== 'playing' || !sim || !sceneMgr) return;

    const hit = sceneMgr.raycastFloorOrStation(e.clientX, e.clientY);
    if (hit) {
      if (hit.clickedThief) {
        sim.catchThief('hero');
        return;
      }
      if (hit.clickedLockedStationId) {
        sim.unlockStationPlot(hit.clickedLockedStationId);
        setUiTick((n) => n + 1);
        return;
      }
      sceneMgr.triggerFloorRipple(hit.worldX, hit.worldZ);
      sim.pointerTarget = { x: hit.worldX, z: hit.worldZ };
    }

    setVirtualStick({
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!virtualStick || !sim) return;
    const dx = e.clientX - virtualStick.startX;
    const dy = e.clientY - virtualStick.startY;
    const dist = Math.hypot(dx, dy);
    setVirtualStick({
      ...virtualStick,
      curX: e.clientX,
      curY: e.clientY,
    });
    if (dist > 10) {
      sim.inputMoveX = dx / dist;
      sim.inputMoveZ = dy / dist;
      sim.pointerTarget = null;
    }
  };

  const handlePointerUp = () => {
    setVirtualStick(null);
    if (sim) {
      sim.inputMoveX = 0;
      sim.inputMoveZ = 0;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!sceneMgr) return;
    sceneMgr.zoomFactor = Math.max(0.75, Math.min(1.6, sceneMgr.zoomFactor - e.deltaY * 0.0008));
  };

  // Run all 22 Acceptance Tests
  const handleRunAcceptanceSuite = async () => {
    if (!sim || !sceneMgr) return;
    setQaRunning(true);
    const res = await runAll22AcceptanceTests(sim, sceneMgr.drawCalls, sceneMgr.fps);
    setQaResults(res);
    setQaRunning(false);
  };

  // Current Onboarding Prompt (§17, max 12 words, non-blocking)
  const getOnboardingPrompt = (): string | null => {
    if (!sim || sim.mart.index !== 1 || sim.martElapsedSeconds > 92 || sim.tutorialStep >= 99) {
      return null;
    }
    if (sim.martElapsedSeconds < 6) return t.tutorialDrag;
    if (sim.martElapsedSeconds < 12) return t.tutorialShelf;
    if (sim.martElapsedSeconds < 18) return t.tutorialTill;
    if (sim.martElapsedSeconds < 26) return t.tutorialMia;
    if (sim.martElapsedSeconds < 38) return t.tutorialSam;
    if (sim.martElapsedSeconds < 55) return t.tutorialUpgrade;
    return t.tutorialDone;
  };

  const onboardingText = getOnboardingPrompt();
  const currentStars = save.progress.stars[sim?.mart.index ?? 1] ?? 0;

  return (
    <div
      dir={localeBundle.rtl ? 'rtl' : 'ltr'}
      style={{
        fontSize: `${Math.round(a11y.fontScale * 100)}%`,
        transform: screenDipPx ? `translateY(${screenDipPx}px)` : undefined,
      }}
      className={`relative w-screen h-screen overflow-hidden select-none ${
        a11y.highContrast ? 'contrast-125' : ''
      } bg-[#16181D] text-[#FFF6E9] font-sans`}
    >
      {/* Isolated WebGL Canvas Container (Zero React Re-Renders on 3D Loop) */}
      <div
        ref={canvasMountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Virtual Stick Indicator on Drag */}
      {virtualStick && gameState === 'playing' && (
        <div
          style={{
            left: virtualStick.startX - 36,
            top: virtualStick.startY - 36,
          }}
          className="pointer-events-none fixed z-20 w-18 h-18 rounded-full border-2 border-[#FFC65C]/70 flex items-center justify-center"
        >
          <div
            style={{
              transform: `translate(${Math.max(-24, Math.min(24, virtualStick.curX - virtualStick.startX))}px, ${Math.max(-24, Math.min(24, virtualStick.curY - virtualStick.startY))}px)`,
            }}
            className="w-7 h-7 rounded-full bg-[#FFC65C]"
          />
        </div>
      )}

      {/* Floating +$N Sale Pops */}
      <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
        {floatingPops.map((p) => (
          <div
            key={p.id}
            style={{ left: `${p.xPct}%`, top: `${p.yPct}%`, color: p.color }}
            className="absolute font-extrabold text-xl tracking-tight tabular-nums animate-bounce drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
          >
            {p.text}
          </div>
        ))}
      </div>

      {/* TITLE SCREEN OVERLAY (Game Shell Pattern) */}
      {gameState === 'title' && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex flex-col items-center justify-between p-6 md:p-10 bg-gradient-to-t from-[#16181D]/95 via-[#16181D]/55 to-transparent">
          <div className="w-full max-w-4xl flex items-center justify-between text-xs font-semibold tracking-wider text-[#F4E4CE]/85">
            <span>MINI MART EVOLVED · V1.0</span>
            <span>{t.adFreeTagline}</span>
          </div>

          {/* Bespoke SVG Title Lockup over negative space */}
          <div className="flex flex-col items-center text-center max-w-xl my-auto">
            <svg
              viewBox="0 0 520 135"
              className="w-full max-w-md h-auto mb-4 drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
              role="img"
              aria-label={t.gameTitle}
            >
              <rect x="18" y="12" width="484" height="110" rx="26" fill="#23324A" stroke="#FFC65C" strokeWidth="5" />
              <path d="M40 34 H480" stroke="#E8503A" strokeWidth="8" strokeLinecap="round" strokeDasharray="22 14" />
              <text
                x="260"
                y="76"
                textAnchor="middle"
                fill="#FFF6E9"
                fontSize="38"
                fontWeight="900"
                letterSpacing="1.5"
              >
                MINI MART EVOLVED
              </text>
              <text
                x="260"
                y="104"
                textAnchor="middle"
                fill="#F2B33D"
                fontSize="15"
                fontWeight="700"
                letterSpacing="3"
              >
                20 MARTS · 48 PRODUCTS · CONTRACT-NET CREW AI
              </text>
            </svg>

            <p className="text-sm md:text-base text-[#F4E4CE] mb-6 max-w-md">
              Harvest fresh produce, run 22 artisan processing machines, and orchestrate 18 staff specialists in a tactile 3D diorama supermarket.
            </p>

            <button
              onClick={() => {
                markUserActivity();
                if (simRef.current) simRef.current.paused = false;
                setGameState('playing');
              }}
              className="px-8 py-4 rounded-2xl bg-[#4FA85C] hover:bg-[#5ec06d] active:scale-95 text-[#FFF6E9] font-extrabold text-lg tracking-wide shadow-[0_6px_0_#2b6934] transition-transform cursor-pointer"
            >
              {t.startPlay} (Enter)
            </button>
          </div>

          {/* Single flat control-hint line */}
          <div className="text-xs md:text-sm text-[#F4E4CE]/90 font-medium tracking-wide text-center">
            {t.controlsHint}
          </div>
        </div>
      )}

      {/* ACTIVE PLAYING HUD (Low-Occlusion Perimeter Clusters, Zero backdrop-filter) */}
      {gameState !== 'title' && sim && (
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-3 md:p-5">
          {/* TOP PERIMETER BAR */}
          <div
            style={{ opacity: hudDimmed && activeModal === 'none' ? 0.35 : 1 }}
            className="pointer-events-auto transition-opacity duration-300 w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 bg-[#23324A] border-2 border-[#FFF6E9]/20 rounded-2xl px-4 py-2.5 shadow-lg"
          >
            {/* Zone 1: Odometer Cash & Carry Stack */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#F2B33D] text-[#16181D] font-black text-sm">
                  $
                </span>
                <span
                  aria-live={a11y.screenReaderAnnouncements ? 'polite' : 'off'}
                  className="text-xl md:text-2xl font-black text-[#F2B33D] tabular-nums tracking-tight"
                >
                  {save.wallets.cash.toLocaleString()}
                </span>
              </div>

              <div className="text-xs md:text-sm font-semibold text-[#F4E4CE] tabular-nums">
                Stack: {sim.hero.carrying.length}/{sim.hero.carryCapacity}
              </div>
            </div>

            {/* Zone 2: Mart Title, 3-Star Progress & Goals */}
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm md:text-base text-[#FFF6E9] whitespace-nowrap">
                Mart {sim.mart.index}/20: {sim.mart.name}
              </span>
              <div className="flex items-center gap-1 text-base" title="Mart Star Rating">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={
                      currentStars >= s ? 'text-[#F2B33D]' : 'text-[#FFF6E9]/25'
                    }
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="hidden lg:inline text-xs text-[#A8E6C1] tabular-nums">
                Rev ${sim.revenueEarned}/${sim.mart.star1Revenue} · Served {sim.customersServed}/{sim.mart.star2Customers}
              </span>
            </div>

            {/* Zone 3: Quick Camera, Mute & Pause Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  markUserActivity();
                  if (sceneRef.current) {
                    sceneRef.current.managerCamActive = !sceneRef.current.managerCamActive;
                    setUiTick((n) => n + 1);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  sceneMgr?.managerCamActive
                    ? 'bg-[#FFC65C] text-[#16181D]'
                    : 'bg-[#16181D] text-[#FFF6E9] hover:bg-[#2E9E9B]'
                }`}
              >
                {t.managerCam}
              </button>

              <button
                onClick={() => {
                  markUserActivity();
                  save.settings.audio.masterMuted = !save.settings.audio.masterMuted;
                  audioRef.current?.updateSettings(save.settings.audio);
                  persistSave(save);
                  setUiTick((n) => n + 1);
                }}
                aria-label="Toggle Mute"
                className="px-2.5 py-1.5 rounded-xl bg-[#16181D] hover:bg-[#2E9E9B] text-xs font-bold cursor-pointer"
              >
                {save.settings.audio.masterMuted ? '🔇' : '🔊'}
              </button>

              <button
                onClick={() => {
                  markUserActivity();
                  const nextPaused = gameState !== 'paused';
                  sim.paused = nextPaused;
                  if (nextPaused) audioRef.current?.suspend();
                  else audioRef.current?.resume();
                  setGameState(nextPaused ? 'paused' : 'playing');
                }}
                className="px-3 py-1.5 rounded-xl bg-[#E8503A] hover:bg-[#ff654f] text-xs font-bold text-[#FFF6E9] cursor-pointer"
              >
                {gameState === 'paused' ? '▶' : '⏸'}
              </button>
            </div>
          </div>

          {/* NON-BLOCKING ONBOARDING / TOAST / THIEF ALERT BANNERS */}
          <div className="my-auto flex flex-col items-center gap-2 pointer-events-none">
            {onboardingText && (
              <div className="pointer-events-auto flex items-center gap-3 bg-[#23324A] border-2 border-[#FFC65C] px-4 py-2 rounded-2xl shadow-lg">
                <span className="text-xs md:text-sm font-bold text-[#FFF6E9]">
                  {onboardingText}
                </span>
                <button
                  onClick={() => {
                    sim.tutorialStep = 99;
                    setUiTick((n) => n + 1);
                  }}
                  className="text-xs font-bold text-[#FFC65C] underline cursor-pointer"
                >
                  Skip
                </button>
              </div>
            )}

            {sim.thief.active && (
              <button
                onClick={() => sim.catchThief('hero')}
                style={{ backgroundColor: dangerColor }}
                className="pointer-events-auto px-4 py-2 rounded-2xl text-xs md:text-sm font-black text-[#FFF6E9] shadow-lg cursor-pointer"
              >
                ⚠ {t.thiefWarning} (Tap to Catch!)
              </button>
            )}

            {toastBanner && (
              <div
                style={{ borderColor: toastBanner.tone }}
                className="bg-[#16181D] border-2 px-4 py-2 rounded-xl text-xs md:text-sm font-bold text-[#FFF6E9] shadow-md"
              >
                {toastBanner.text}
              </div>
            )}

            {a11y.subtitles && captionText && (
              <div className="bg-[#16181D] px-3 py-1 rounded-lg text-xs font-mono text-[#A8E6C1]">
                CC: {captionText}
              </div>
            )}
          </div>

          {/* COLLAPSIBLE BOTTOM CONTROL DOCK (§5 of Three.js skill & §10.1) */}
          <div className="pointer-events-auto w-full max-w-3xl mx-auto flex flex-col items-center">
            <button
              onClick={() => {
                markUserActivity();
                setDockCollapsed((c) => !c);
              }}
              className="mb-1 px-3 py-1 rounded-t-xl bg-[#23324A] border border-b-0 border-[#FFF6E9]/20 text-[11px] font-bold text-[#F4E4CE] hover:text-[#FFC65C] cursor-pointer"
            >
              {dockCollapsed ? '▴ Show Store Controls (H)' : '▾ Hide Controls (H)'}
            </button>

            {!dockCollapsed && (
              <div className="w-full bg-[#23324A] border-2 border-[#FFF6E9]/20 rounded-2xl p-2.5 shadow-xl flex flex-wrap items-center justify-between gap-2">
                {/* 4 Primary Dock Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      markUserActivity();
                      setActiveModal(activeModal === 'upgrades' ? 'none' : 'upgrades');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold cursor-pointer whitespace-nowrap ${
                      activeModal === 'upgrades'
                        ? 'bg-[#F2B33D] text-[#16181D]'
                        : 'bg-[#16181D] text-[#FFF6E9] hover:bg-[#2E9E9B]'
                    }`}
                  >
                    ⬆ {t.upgradeTab}
                  </button>

                  <button
                    onClick={() => {
                      markUserActivity();
                      setActiveModal(activeModal === 'staff' ? 'none' : 'staff');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold cursor-pointer whitespace-nowrap ${
                      activeModal === 'staff'
                        ? 'bg-[#F2B33D] text-[#16181D]'
                        : 'bg-[#16181D] text-[#FFF6E9] hover:bg-[#2E9E9B]'
                    }`}
                  >
                    👥 {t.staffTab} ({sim.staff.length})
                  </button>

                  <button
                    onClick={() => {
                      markUserActivity();
                      setActiveModal(activeModal === 'map' ? 'none' : 'map');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold cursor-pointer whitespace-nowrap ${
                      activeModal === 'map'
                        ? 'bg-[#F2B33D] text-[#16181D]'
                        : 'bg-[#16181D] text-[#FFF6E9] hover:bg-[#2E9E9B]'
                    }`}
                  >
                    🗺 {t.mapTab} ({sim.mart.index}/20)
                  </button>

                  <button
                    onClick={() => {
                      markUserActivity();
                      setActiveModal(activeModal === 'settings' ? 'none' : 'settings');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold cursor-pointer whitespace-nowrap ${
                      activeModal === 'settings'
                        ? 'bg-[#F2B33D] text-[#16181D]'
                        : 'bg-[#16181D] text-[#FFF6E9] hover:bg-[#2E9E9B]'
                    }`}
                  >
                    ⚙ {t.settingsTab}
                  </button>
                </div>

                {/* Quick Unlock Next Plot CTA or QA Cert Suite button */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const unlockedSet = new Set(
                      save.marts[sim.mart.index]?.unlockedPlots ?? [],
                    );
                    const nextLocked = sim.mart.stations.find(
                      (s) => s.unlockCost > 0 && !unlockedSet.has(s.id),
                    );
                    if (!nextLocked) return null;
                    const canAfford = save.wallets.cash >= nextLocked.unlockCost;
                    return (
                      <button
                        disabled={!canAfford}
                        onClick={() => {
                          markUserActivity();
                          sim.unlockStationPlot(nextLocked.id);
                          setUiTick((n) => n + 1);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-extrabold tabular-nums cursor-pointer whitespace-nowrap ${
                          canAfford
                            ? 'bg-[#4FA85C] text-[#FFF6E9] hover:bg-[#5ec06d]'
                            : 'bg-[#16181D]/60 text-[#FFF6E9]/45 cursor-not-allowed'
                        }`}
                      >
                        + Unlock {nextLocked.label} (${nextLocked.unlockCost})
                      </button>
                    );
                  })()}

                  <button
                    onClick={() => {
                      markUserActivity();
                      setActiveModal(activeModal === 'qa' ? 'none' : 'qa');
                      if (!qaResults) void handleRunAcceptanceSuite();
                    }}
                    style={{ backgroundColor: premiumColor }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-[#FFF6E9] cursor-pointer whitespace-nowrap"
                  >
                    ✓ QA (22)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: 14 UPGRADE TRACKS DECK (§8.3, §10.4) */}
      {activeModal === 'upgrades' && sim && (
        <div className="pointer-events-auto fixed inset-0 z-40 bg-[#16181D]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[82vh] bg-[#23324A] border-2 border-[#FFF6E9]/25 rounded-3xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-[#FFF6E9]">
                  Store & Hero Upgrades (14 Tracks × 12 Levels)
                </h2>
                <p className="text-xs text-[#F4E4CE]/80">
                  Wallet: <span className="text-[#F2B33D] font-bold tabular-nums">${save.wallets.cash.toLocaleString()}</span>
                </p>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="px-3.5 py-1.5 rounded-xl bg-[#E8503A] text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1">
              {UPGRADE_TRACKS.map((track) => {
                const lvl = save.upgrades[track.id] ?? 0;
                const isMax = lvl >= track.maxLevel;
                const cost = computeUpgradeCost(track.id, lvl);
                const canAfford = !isMax && save.wallets.cash >= cost;

                return (
                  <div
                    key={track.id}
                    className="bg-[#16181D] border border-[#FFF6E9]/15 rounded-2xl p-3.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-[#FFC65C] mb-1">
                        <span>{track.name}</span>
                        <span className="tabular-nums">Lv.{lvl}/{track.maxLevel}</span>
                      </div>
                      <p className="text-xs text-[#F4E4CE]/80 mb-2">{track.effectSummary}</p>
                      <div className="text-xs font-mono text-[#A8E6C1] mb-3 tabular-nums">
                        {track.formatValue(lvl)} {!isMax && `→ ${track.formatValue(lvl + 1)}`}
                      </div>
                    </div>

                    <button
                      disabled={!canAfford}
                      onClick={() => {
                        sim.buyUpgrade(track.id);
                        setUiTick((n) => n + 1);
                      }}
                      className={`w-full py-2 rounded-xl text-xs font-extrabold tabular-nums cursor-pointer ${
                        isMax
                          ? 'bg-[#2E9E9B]/40 text-[#A8E6C1] cursor-default'
                          : canAfford
                            ? 'bg-[#4FA85C] hover:bg-[#5ec06d] text-[#FFF6E9]'
                            : 'bg-[#23324A] text-[#FFF6E9]/40 cursor-not-allowed'
                      }`}
                    >
                      {isMax ? 'MAXED OUT' : `Upgrade · $${cost.toLocaleString()}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: STAFF ROSTER, CONTRACT-NET LIVE RADAR & AUTO-HIRE BOT (§7.2, §8.4, §10.4) */}
      {activeModal === 'staff' && sim && (
        <div className="pointer-events-auto fixed inset-0 z-40 bg-[#16181D]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[85vh] bg-[#23324A] border-2 border-[#FFF6E9]/25 rounded-3xl p-6 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-[#FFF6E9]">
                  Crew Roster & Contract-Net Auction Floor Map
                </h2>
                <p className="text-xs text-[#F4E4CE]/80">
                  6 Classes × 3 Tiers (Junior, Senior, Manager) · Live ECS Single Source of Truth
                </p>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="px-3.5 py-1.5 rounded-xl bg-[#E8503A] text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-y-auto">
              {/* Left 2 Columns: Hire Classes + Active Crew Cards */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STAFF_CLASSES.map((sc) => {
                    const count = save.staff.filter((s) => s.role === sc.role).length;
                    const cost = computeHireCost(sc.role, count);
                    const canAfford = save.wallets.cash >= cost;
                    return (
                      <div
                        key={sc.role}
                        className="bg-[#16181D] border border-[#FFF6E9]/15 rounded-xl p-2.5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-bold text-[#FFF6E9]">
                            <span>{sc.title}</span>
                            <span className="text-[#FFC65C] tabular-nums">×{count}</span>
                          </div>
                          <p className="text-[11px] text-[#F4E4CE]/75 my-1">
                            {sc.capabilitySummary}
                          </p>
                        </div>
                        <button
                          disabled={!canAfford}
                          onClick={() => {
                            sim.hireStaff(sc.role);
                            setUiTick((n) => n + 1);
                          }}
                          className={`mt-1 py-1.5 rounded-lg text-xs font-extrabold tabular-nums cursor-pointer ${
                            canAfford
                              ? 'bg-[#4FA85C] text-[#FFF6E9]'
                              : 'bg-[#23324A] text-[#FFF6E9]/40 cursor-not-allowed'
                          }`}
                        >
                          Hire · ${cost}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Active Staff Cards reading live from sim.staff */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {sim.staff.map((st) => {
                    const wage = computeWagePerMin(st.role, st.tier);
                    const tierLabel =
                      st.tier === 3 ? '★ Manager' : st.tier === 2 ? 'Senior' : 'Junior';
                    return (
                      <div
                        key={st.id}
                        className="bg-[#16181D] border border-[#FFF6E9]/15 rounded-xl p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-sm text-[#FFF6E9]">{st.name}</span>
                            <span className="ml-2 text-xs text-[#FFC65C] font-semibold">
                              {st.role.toUpperCase()} · {tierLabel}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#F4E4CE]/70 tabular-nums">
                            ${wage}/m
                          </span>
                        </div>

                        <div className="text-xs font-mono text-[#A8E6C1] truncate">
                          Task: {st.currentTaskLabel} · Stack {st.carrying.length}/{st.carryCapacity}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {(['speed', 'carry', 'efficiency', 'stamina'] as const).map((stat) => {
                            const lvl = st.levels[stat];
                            const cost = Math.ceil(65 * Math.pow(1.32, lvl - 1));
                            const canBuy = lvl < 8 && save.wallets.cash >= cost;
                            return (
                              <button
                                key={stat}
                                disabled={!canBuy}
                                onClick={() => {
                                  sim.upgradeStaffMember(st.id, stat);
                                  setUiTick((n) => n + 1);
                                }}
                                className={`py-1 px-2 rounded-lg text-[11px] font-bold tabular-nums cursor-pointer ${
                                  canBuy
                                    ? 'bg-[#2E9E9B] text-[#FFF6E9]'
                                    : 'bg-[#23324A] text-[#FFF6E9]/40'
                                }`}
                              >
                                {stat} Lv.{lvl} {lvl < 8 ? `($${cost})` : '(MAX)'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Live Minimap Dot Radar + Auto-Hire Clipboard Bot */}
              <div className="flex flex-col gap-3">
                <div className="bg-[#16181D] border border-[#FFF6E9]/15 rounded-2xl p-3">
                  <div className="text-xs font-bold text-[#FFC65C] mb-2">
                    Live Floor Minimap (ECS Coordinates)
                  </div>
                  <div className="relative w-full h-44 bg-[#23324A] rounded-xl overflow-hidden border border-[#FFF6E9]/15">
                    {/* Hero Dot */}
                    <div
                      style={{
                        left: `${((sim.hero.x + 8.5) / 17) * 100}%`,
                        top: `${((sim.hero.z + 6.5) / 13) * 100}%`,
                      }}
                      title="Hero"
                      className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-[#E8503A] border border-white"
                    />
                    {/* Staff Dots */}
                    {sim.staff.map((st) => (
                      <div
                        key={st.id}
                        style={{
                          left: `${((st.x + 8.5) / 17) * 100}%`,
                          top: `${((st.z + 6.5) / 13) * 100}%`,
                        }}
                        title={`${st.name} (${st.role})`}
                        className="absolute w-2.5 h-2.5 -ml-1 -mt-1 rounded-full bg-[#FFC65C]"
                      />
                    ))}
                    {/* Customer Dots */}
                    {sim.customers.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          left: `${((c.x + 8.5) / 17) * 100}%`,
                          top: `${((c.z + 6.5) / 13) * 100}%`,
                        }}
                        className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-[#A8E6C1]/80"
                      />
                    ))}
                  </div>
                </div>

                {/* Clipboard Bot Auto-Hire Assistant (§8.6) */}
                <div className="bg-[#16181D] border border-[#2E9E9B] rounded-2xl p-3.5 flex flex-col gap-2">
                  <div className="text-xs font-extrabold text-[#A8E6C1]">
                    🤖 {t.autoHireBot} (Lv.{save.upgrades.autoHire ?? 0})
                  </div>
                  <button
                    onClick={() => {
                      sim.hireBottleneckRole();
                      setUiTick((n) => n + 1);
                    }}
                    className="py-2 px-3 rounded-xl bg-[#2E9E9B] hover:bg-[#38b8b4] text-xs font-bold text-[#FFF6E9] cursor-pointer"
                  >
                    {t.hireNeeded}
                  </button>
                  <label className="flex items-center justify-between text-xs text-[#F4E4CE] cursor-pointer">
                    <span>{t.autoAssign}</span>
                    <input
                      type="checkbox"
                      checked={save.autoHire.autoAssign}
                      onChange={(e) => {
                        save.autoHire.autoAssign = e.target.checked;
                        persistSave(save);
                        setUiTick((n) => n + 1);
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-[#F4E4CE] cursor-pointer">
                    <span>{t.autoUpgrade}</span>
                    <input
                      type="checkbox"
                      checked={save.autoHire.autoUpgradeCheapest}
                      onChange={(e) => {
                        save.autoHire.autoUpgradeCheapest = e.target.checked;
                        persistSave(save);
                        setUiTick((n) => n + 1);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: 20 MARTS MAP & ENDLESS PRESTIGE (§9) */}
      {activeModal === 'map' && sim && (
        <div className="pointer-events-auto fixed inset-0 z-40 bg-[#16181D]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[85vh] bg-[#23324A] border-2 border-[#FFF6E9]/25 rounded-3xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-[#FFF6E9]">
                  20 Hand-Authored Marts + Endless Prestige Loop
                </h2>
                <p className="text-xs text-[#F4E4CE]/80">
                  Prestige Loop: ×{Math.pow(1.12, save.progress.prestige).toFixed(2)} Income Multiplier
                </p>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="px-3.5 py-1.5 rounded-xl bg-[#E8503A] text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Endless Prestige Modifier Selector */}
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-[#16181D] p-3 rounded-2xl">
              <span className="text-xs font-bold text-[#FFC65C]">Prestige Run Modifier:</span>
              <button
                onClick={() => {
                  save.progress.activeModifier = null;
                  persistSave(save);
                  setUiTick((n) => n + 1);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  save.progress.activeModifier === null
                    ? 'bg-[#4FA85C] text-[#FFF6E9]'
                    : 'bg-[#23324A] text-[#F4E4CE]'
                }`}
              >
                Standard
              </button>
              {PRESTIGE_MODIFIERS.map((mod) => (
                <button
                  key={mod.id}
                  onClick={() => {
                    save.progress.activeModifier = mod.id;
                    save.progress.prestige = Math.max(1, save.progress.prestige);
                    persistSave(save);
                    setUiTick((n) => n + 1);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    save.progress.activeModifier === mod.id
                      ? 'bg-[#8E5BC9] text-[#FFF6E9]'
                      : 'bg-[#23324A] text-[#F4E4CE]'
                  }`}
                >
                  {mod.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-y-auto pr-1">
              {MARTS.map((m) => {
                const stars = save.progress.stars[m.index] ?? 0;
                const isCurrent = sim.mart.index === m.index;
                return (
                  <div
                    key={m.index}
                    className={`rounded-2xl p-3.5 border-2 flex flex-col justify-between ${
                      isCurrent
                        ? 'bg-[#16181D] border-[#F2B33D]'
                        : 'bg-[#16181D]/90 border-[#FFF6E9]/15'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-[#FFC65C]">
                        <span>Mart #{m.index}</span>
                        <span>
                          {'★'.repeat(stars)}
                          {'☆'.repeat(3 - stars)}
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-[#FFF6E9] mt-0.5">
                        {m.name}
                      </h3>
                      <p className="text-[11px] text-[#A8E6C1] font-medium mt-0.5">
                        Verb: {m.newVerb}
                      </p>
                      <p className="text-[11px] text-[#F4E4CE]/70 mt-1">
                        Signature: {m.signatureProp}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        sim.loadMart(m.index);
                        persistSave(save);
                        setActiveModal('none');
                        setUiTick((n) => n + 1);
                      }}
                      className={`mt-3 w-full py-2 rounded-xl text-xs font-extrabold cursor-pointer ${
                        isCurrent
                          ? 'bg-[#F2B33D] text-[#16181D]'
                          : 'bg-[#2E9E9B] hover:bg-[#38b8b4] text-[#FFF6E9]'
                      }`}
                    >
                      {isCurrent ? 'Active Storefront' : 'Travel & Open Mart'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SETTINGS, 9 ACCESSIBILITY FEATURES & 11 LOCALES (§10.5, §10.6) */}
      {activeModal === 'settings' && sim && (
        <div className="pointer-events-auto fixed inset-0 z-40 bg-[#16181D]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[85vh] bg-[#23324A] border-2 border-[#FFF6E9]/25 rounded-3xl p-6 flex flex-col overflow-y-auto gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-[#FFF6E9]">
                Settings, Accessibility (9 Features) & 11 Languages
              </h2>
              <button
                onClick={() => setActiveModal('none')}
                className="px-3.5 py-1.5 rounded-xl bg-[#E8503A] text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Audio & Graphics */}
              <div className="bg-[#16181D] rounded-2xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-extrabold text-[#FFC65C]">
                  Procedural Audio Buses & Graphics
                </h3>
                {(['sfx', 'asmr', 'music', 'ui'] as const).map((bus) => (
                  <label key={bus} className="flex items-center justify-between text-xs">
                    <span className="uppercase font-bold">{bus} Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={save.settings.audio[bus]}
                      onChange={(e) => {
                        save.settings.audio[bus] = parseFloat(e.target.value);
                        audioRef.current?.updateSettings(save.settings.audio);
                        persistSave(save);
                        setUiTick((n) => n + 1);
                      }}
                    />
                  </label>
                ))}

                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="font-bold">Graphics Quality</span>
                  <div className="flex gap-1">
                    {(['low', 'balanced', 'high', 'ultra'] as GraphicsPreset[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => {
                          save.settings.graphics = g;
                          sceneRef.current?.applyGraphicsPreset(g);
                          persistSave(save);
                          setUiTick((n) => n + 1);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-bold uppercase cursor-pointer ${
                          save.settings.graphics === g
                            ? 'bg-[#F2B33D] text-[#16181D]'
                            : 'bg-[#23324A] text-[#F4E4CE]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="font-bold">Language (11 Locales)</span>
                  <select
                    value={save.settings.locale}
                    onChange={(e) => {
                      save.settings.locale = e.target.value as LocaleCode;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                    className="bg-[#23324A] text-[#FFF6E9] rounded-lg px-2.5 py-1 text-xs font-bold"
                  >
                    {Object.values(LOCALES).map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {loc.label} ({loc.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* All 9 Accessibility Features (§10.5) */}
              <div className="bg-[#16181D] rounded-2xl p-4 flex flex-col gap-2.5">
                <h3 className="text-sm font-extrabold text-[#A8E6C1]">
                  Accessibility & Difficulty Assists (No Penalty)
                </h3>

                <label className="flex items-center justify-between text-xs">
                  <span>1. Dynamic Type Scale ({Math.round(a11y.fontScale * 100)}%)</span>
                  <input
                    type="range"
                    min={0.85}
                    max={1.35}
                    step={0.05}
                    value={a11y.fontScale}
                    onChange={(e) => {
                      a11y.fontScale = parseFloat(e.target.value);
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>2. Reduce Motion (Disable Shake/Particles)</span>
                  <input
                    type="checkbox"
                    checked={a11y.reduceMotion}
                    onChange={(e) => {
                      a11y.reduceMotion = e.target.checked;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>

                <label className="flex items-center justify-between text-xs">
                  <span>3. Colour-Blind Palette</span>
                  <select
                    value={a11y.colorBlindMode}
                    onChange={(e) => {
                      a11y.colorBlindMode = e.target.value as ColorBlindMode;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                    className="bg-[#23324A] rounded px-2 py-0.5 text-xs"
                  >
                    <option value="none">Standard</option>
                    <option value="deuteranopia">Deuteranopia</option>
                    <option value="protanopia">Protanopia</option>
                    <option value="tritanopia">Tritanopia</option>
                  </select>
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>4. High-Contrast UI Mode</span>
                  <input
                    type="checkbox"
                    checked={a11y.highContrast}
                    onChange={(e) => {
                      a11y.highContrast = e.target.checked;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>5. Subtitles / Non-Diegetic Audio Captions</span>
                  <input
                    type="checkbox"
                    checked={a11y.subtitles}
                    onChange={(e) => {
                      a11y.subtitles = e.target.checked;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>6. Assist: +50% Customer Patience</span>
                  <input
                    type="checkbox"
                    checked={a11y.assistPatienceBonus}
                    onChange={(e) => {
                      a11y.assistPatienceBonus = e.target.checked;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>7. Assist: +25% Store Income</span>
                  <input
                    type="checkbox"
                    checked={a11y.assistIncomeBonus}
                    onChange={(e) => {
                      a11y.assistIncomeBonus = e.target.checked;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>8. Assist: Disable Thief Visits</span>
                  <input
                    type="checkbox"
                    checked={a11y.assistNoThief}
                    onChange={(e) => {
                      a11y.assistNoThief = e.target.checked;
                      persistSave(save);
                      setUiTick((n) => n + 1);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: 22 ACCEPTANCE TESTS RUNNER (§18) */}
      {activeModal === 'qa' && (
        <div className="pointer-events-auto fixed inset-0 z-40 bg-[#16181D]/90 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[85vh] bg-[#23324A] border-2 border-[#A8E6C1] rounded-3xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xl font-black text-[#FFF6E9]">
                  §18 Automated Acceptance Test Suite (T1–T22)
                </h2>
                <p className="text-xs text-[#A8E6C1]">
                  Live verification of Determinism, No-Wait Rule, Contract-Net Soak, Checksum Recovery & Playables SDK
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleRunAcceptanceSuite()}
                  className="px-3.5 py-1.5 rounded-xl bg-[#4FA85C] text-xs font-bold cursor-pointer"
                >
                  {qaRunning ? 'Running...' : 'Re-Run All 22 Tests'}
                </button>
                <button
                  onClick={() => setActiveModal('none')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#E8503A] text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto divide-y divide-[#FFF6E9]/10 bg-[#16181D] rounded-2xl p-3">
              {(qaResults ?? []).map((r) => (
                <div
                  key={r.id}
                  className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-black ${
                        r.passed ? 'bg-[#4FA85C] text-[#FFF6E9]' : 'bg-[#E8503A] text-[#FFF6E9]'
                      }`}
                    >
                      {r.id} {r.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="font-bold text-[#FFF6E9]">{r.name}</span>
                  </div>
                  <div className="text-[#F4E4CE]/80 font-mono tabular-nums">
                    {r.measured}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OFFLINE EARNINGS CARD (§7.11) */}
      {offlineCard && sim && (
        <div className="pointer-events-auto fixed inset-0 z-50 bg-[#16181D]/85 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#23324A] border-2 border-[#F2B33D] rounded-3xl p-6 text-center flex flex-col gap-3">
            <h2 className="text-xl font-black text-[#F2B33D]">{t.whileYouWereAway}</h2>
            <p className="text-xs text-[#F4E4CE]">
              Your crew kept the shelves stocked for {Math.floor(offlineCard.seconds / 60)}m{' '}
              {offlineCard.seconds % 60}s (capped at 4h).
            </p>
            <div className="text-3xl font-black text-[#4FA85C] tabular-nums my-2">
              +${offlineCard.earnings.toLocaleString()}
            </div>
            <button
              onClick={() => {
                sim.save.wallets.cash += offlineCard.earnings;
                persistSave(sim.save);
                setOfflineCard(null);
                setUiTick((n) => n + 1);
              }}
              className="py-3 rounded-2xl bg-[#4FA85C] text-sm font-extrabold text-[#FFF6E9] cursor-pointer"
            >
              {t.collectOffline}
            </button>
          </div>
        </div>
      )}

      {/* HIDDEN PERF OVERLAY (`~` Key, §15) */}
      {perfOverlayOpen && sceneMgr && sim && (
        <div className="pointer-events-none fixed top-20 left-4 z-50 bg-[#16181D] border border-[#2E9E9B] rounded-xl p-3 text-[11px] font-mono text-[#A8E6C1] tabular-nums">
          <div>FPS: {Math.round(sceneMgr.fps)} ({sceneMgr.frameTimeMs.toFixed(1)} ms)</div>
          <div>Draw Calls: {sceneMgr.drawCalls} (&lt; 90 budget)</div>
          <div>Triangles: {sceneMgr.triangleCount.toLocaleString()}</div>
          <div>Agents: {1 + sim.staff.length + sim.customers.length}</div>
          <div>Open Auction Jobs: {sim.broker.getOpenJobs().length}</div>
          <div>Seed: 0x{sim.rng.initialSeed.toString(16)}</div>
        </div>
      )}
    </div>
  );
}
