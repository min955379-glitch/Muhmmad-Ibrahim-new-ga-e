/**
 * Three.js Toy-Diorama Scene Manager (§5, §12, §15)
 * Implements studio PBR lighting, RoomEnvironment, software-WebGL guard,
 * composite multi-part stations, Manager Cam flow arrows, and pooled particles.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ProceduralCharacterVisual,
  createCharacterRig,
  createClipboardBotMesh,
  updateCharacterRig,
} from '../characters/rig';
import { getMachineDef } from '../content/machines';
import { getProduct } from '../content/products';
import { STAFF_CLASS_MAP } from '../content/upgrades';
import { GraphicsPreset } from '../core/save';
import { SimWorld } from '../sim/world';
import {
  createBadgeLabelTexture,
  createContactShadowTexture,
  createRoundedBoxGeometry,
  createTerrazzoFloorTexture,
} from './geometry-helpers';

interface StationVisualGroup {
  id: string;
  type: string;
  unlockedGroup: THREE.Group;
  ghostGroup: THREE.Group;
  dynamicParts: THREE.Object3D[];
  progressRing?: THREE.Mesh;
  jamBadge?: THREE.Sprite;
  worriedSprite?: THREE.Sprite;
  welfareRing?: THREE.Mesh;
}

interface PooledBurstParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export class MartSceneManager {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly isSoftwareGl: boolean;

  private sim: SimWorld;
  private currentMartIndex = -1;
  private contactShadowTex: THREE.CanvasTexture;
  private floorMesh: THREE.Mesh | null = null;
  private ceilingFan: THREE.Group | null = null;
  private clockMinuteHand: THREE.Object3D | null = null;
  private clipboardBot: THREE.Group | null = null;

  private stationVisuals = new Map<string, StationVisualGroup>();
  private heroVis: ProceduralCharacterVisual;
  private staffVisMap = new Map<string, ProceduralCharacterVisual>();
  private customerVisMap = new Map<string, ProceduralCharacterVisual>();
  private thiefVis: ProceduralCharacterVisual;

  // Manager Cam & Orbit Camera state (§5.2)
  public managerCamActive = false;
  private managerCamBlend = 0; // 0 = normal 3/4, 1 = 72° top-down schematic
  private introTimer = 0; // 0..2.5s curved dolly intro
  public orbitYaw = 0;
  public orbitPitch = 0.72; // radians (~41 deg)
  public zoomFactor = 1.0;
  private idleOrbitSeconds = 0;
  public cameraShake = 0;
  private flowArrowGroup = new THREE.Group();

  // Floor tap ripple ring (§12)
  private rippleMesh: THREE.Mesh;
  private rippleLife = 0;

  // Ambient dust motes (400 points, §5.8) & Pooled 600 burst particles (§12)
  private dustPoints: THREE.Points;
  private burstPoints: THREE.Points;
  private burstGeo: THREE.BufferGeometry;
  private burstPositions: Float32Array;
  private burstPool: PooledBurstParticle[] = [];

  // Reusable raycasting helpers (Zero GC in hot loop)
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();

  // Perf metrics for `~` overlay (§15)
  public fps = 60;
  public frameTimeMs = 16.6;
  public drawCalls = 0;
  public triangleCount = 0;

  constructor(container: HTMLElement, sim: SimWorld) {
    this.sim = sim;

    // 1. Software-WebGL Guard per Three.js skill
    this.isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Studio RoomEnvironment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2838);
    this.scene.fog = new THREE.FogExp2(0x1c2838, 0.018);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Camera (38° FOV per §5.2)
    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.5, 90);
    this.camera.position.set(0, 12.5, 13.5);
    this.camera.lookAt(0, 0, 0.6);

    // 4. Lighting Rig (§5.5: Key #FFE9C8, Fill #8FB8D9/#4A3F35, Bounce #FFF2DD)
    const keyLight = new THREE.DirectionalLight(0xffe9c8, 2.2);
    keyLight.position.set(9, 15, 10);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 38;
    const d = 11;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const hemiFill = new THREE.HemisphereLight(0x8fb8d9, 0x4a3f35, 0.58);
    this.scene.add(hemiFill);

    const ceilingBounce = new THREE.PointLight(0xfff2dd, 0.45, 25);
    ceilingBounce.position.set(0, 6.5, 0);
    this.scene.add(ceilingBounce);

    this.contactShadowTex = createContactShadowTexture();

    // 5. Hero & Thief Character Rigs
    this.heroVis = createCharacterRig({
      bodyColor: 0xe8503a,
      apronColor: 0xfff6e9,
      role: 'hero',
      tier: 2,
      contactShadowTex: this.contactShadowTex,
    });
    this.scene.add(this.heroVis.root);

    this.thiefVis = createCharacterRig({
      bodyColor: 0x16181d,
      apronColor: 0x8e5bc9,
      role: 'thief',
      tier: 1,
      contactShadowTex: this.contactShadowTex,
    });
    this.thiefVis.root.visible = false;
    this.scene.add(this.thiefVis.root);

    // 6. Tap Ripple Ring (§12)
    const rippleGeo = new THREE.RingGeometry(0.18, 0.28, 24);
    rippleGeo.rotateX(-Math.PI * 0.5);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xffc65c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
    this.rippleMesh.position.y = 0.03;
    this.scene.add(this.rippleMesh);

    // 7. Ambient Dust Motes (400 points, §5.8)
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(400 * 3);
    let dSeed = 0x44556677;
    for (let i = 0; i < 400; i++) {
      dSeed = (Math.imul(dSeed, 1664525) + 1013904223) >>> 0;
      dustPos[i * 3] = ((dSeed & 0xffff) / 0xffff - 0.5) * 16;
      dSeed = (Math.imul(dSeed, 1664525) + 1013904223) >>> 0;
      dustPos[i * 3 + 1] = 0.6 + ((dSeed & 0xffff) / 0xffff) * 4.5;
      dSeed = (Math.imul(dSeed, 1664525) + 1013904223) >>> 0;
      dustPos[i * 3 + 2] = ((dSeed & 0xffff) / 0xffff - 0.5) * 12;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffe9c8,
      size: 0.07,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);

    // 8. Pooled 600-point Burst Particles (§12)
    this.burstGeo = new THREE.BufferGeometry();
    this.burstPositions = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      this.burstPositions[i * 3 + 1] = -999;
      this.burstPool.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.6,
      });
    }
    this.burstGeo.setAttribute('position', new THREE.BufferAttribute(this.burstPositions, 3));
    const burstMat = new THREE.PointsMaterial({
      color: 0xf2b33d,
      size: 0.16,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.burstPoints = new THREE.Points(this.burstGeo, burstMat);
    this.burstPoints.frustumCulled = false;
    this.scene.add(this.burstPoints);

    // 9. Manager Cam Flow Arrow Group
    this.scene.add(this.flowArrowGroup);

    // Subscribe to sim events for particles & shake
    this.sim.events.on('CASH_COLLECT', ({ x, z }) => {
      this.spawnParticleBurst(x, 0.8, z, 28);
    });
    this.sim.events.on('PURCHASE_SUCCESS', () => {
      this.spawnParticleBurst(this.sim.hero.x, 1.2, this.sim.hero.z, 36);
    });
    this.sim.events.on('MACHINE_COMPLETE', ({ x, z }) => {
      this.cameraShake = 0.14;
      this.spawnParticleBurst(x, 1.1, z, 14);
    });
    this.sim.events.on('STAR_EARNED', () => {
      this.spawnParticleBurst(this.sim.hero.x, 1.8, this.sim.hero.z, 60);
    });

    this.rebuildMartSceneIfNeeded();
  }

  public applyGraphicsPreset(preset: GraphicsPreset): void {
    if (this.isSoftwareGl) return;
    if (preset === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.dustPoints.visible = false;
    } else if (preset === 'balanced') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.dustPoints.visible = true;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.dustPoints.visible = true;
    }
  }

  public spawnParticleBurst(x: number, y: number, z: number, count: number): void {
    if (this.sim.save.settings.a11y.reduceMotion) return;
    let spawned = 0;
    for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
      const p = this.burstPool[i]!;
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        const angle = (spawned / count) * Math.PI * 2;
        const speed = 1.2 + (spawned % 4) * 0.55;
        p.vx = Math.cos(angle) * speed;
        p.vy = 2.4 + (spawned % 3) * 0.8;
        p.vz = Math.sin(angle) * speed;
        p.life = 0;
        p.maxLife = 0.55;
        spawned++;
      }
    }
  }

  public triggerFloorRipple(x: number, z: number): void {
    this.rippleMesh.position.set(x, 0.03, z);
    this.rippleLife = 1.0;
  }

  public raycastFloorOrStation(
    clientX: number,
    clientY: number,
  ): { worldX: number; worldZ: number; clickedLockedStationId: string | null; clickedThief: boolean } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, this.hitPoint);
    if (!hit) return null;

    // Check if player tapped near active thief (§7.10)
    if (this.sim.thief.active) {
      const dThief = Math.hypot(this.hitPoint.x - this.sim.thief.x, this.hitPoint.z - this.sim.thief.z);
      if (dThief <= 1.25) {
        return {
          worldX: this.hitPoint.x,
          worldZ: this.hitPoint.z,
          clickedLockedStationId: null,
          clickedThief: true,
        };
      }
    }

    // Check if player tapped on a locked plot frame to unlock
    const unlockedSet = new Set(this.sim.save.marts[this.sim.mart.index]?.unlockedPlots ?? []);
    for (const bp of this.sim.mart.stations) {
      if (bp.unlockCost > 0 && !unlockedSet.has(bp.id)) {
        const dist = Math.hypot(this.hitPoint.x - bp.x, this.hitPoint.z - bp.z);
        if (dist <= 1.2) {
          return {
            worldX: this.hitPoint.x,
            worldZ: this.hitPoint.z,
            clickedLockedStationId: bp.id,
            clickedThief: false,
          };
        }
      }
    }

    return {
      worldX: this.hitPoint.x,
      worldZ: this.hitPoint.z,
      clickedLockedStationId: null,
      clickedThief: false,
    };
  }

  public rebuildMartSceneIfNeeded(): void {
    if (this.currentMartIndex === this.sim.mart.index) return;
    this.currentMartIndex = this.sim.mart.index;
    this.introTimer = this.sim.save.settings.a11y.reduceMotion ? 2.5 : 0;

    // Dispose old station visuals
    for (const v of this.stationVisuals.values()) {
      this.scene.remove(v.unlockedGroup);
      this.scene.remove(v.ghostGroup);
    }
    this.stationVisuals.clear();

    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
    }

    const mart = this.sim.mart;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const floorTex = createTerrazzoFloorTexture(
      mart.floorPrimaryColor,
      mart.floorSecondaryColor,
      maxAniso,
    );

    // Diorama Store Platform + Bevelled Base
    const floorGroup = new THREE.Group();
    const slabGeo = createRoundedBoxGeometry(17.4, 0.45, 13.4, 0.14, false);
    const slabMat = new THREE.MeshStandardMaterial({
      color: mart.wallColor,
      roughness: 0.6,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = -0.45;
    slab.receiveShadow = true;
    floorGroup.add(slab);

    const tilePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(16.8, 12.8),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.48,
        metalness: 0.04,
      }),
    );
    tilePlane.rotation.x = -Math.PI * 0.5;
    tilePlane.position.y = 0.005;
    tilePlane.receiveShadow = true;
    floorGroup.add(tilePlane);

    // Back & Side Diorama Walls + Environment Dressing (§5.8)
    const wallMat = new THREE.MeshStandardMaterial({
      color: mart.wallColor,
      roughness: 0.58,
    });
    const backWall = new THREE.Mesh(
      createRoundedBoxGeometry(17.2, 2.8, 0.35, 0.08, false),
      wallMat,
    );
    backWall.position.set(0, 0, -6.55);
    backWall.receiveShadow = true;
    floorGroup.add(backWall);

    const leftWall = new THREE.Mesh(
      createRoundedBoxGeometry(0.35, 2.4, 13.2, 0.08, false),
      wallMat,
    );
    leftWall.position.set(-8.55, 0, 0);
    floorGroup.add(leftWall);

    // Rolling Green Awning / Storefront Arch at South Entrance
    const awningMat = new THREE.MeshStandardMaterial({
      color: mart.accentColor,
      roughness: 0.42,
    });
    const awning = new THREE.Mesh(
      createRoundedBoxGeometry(4.6, 0.32, 1.1, 0.08, false),
      awningMat,
    );
    awning.position.set(0, 2.35, 6.1);
    floorGroup.add(awning);

    // Ceiling Fan & Wall Clock (§5.8)
    this.ceilingFan = new THREE.Group();
    this.ceilingFan.position.set(0, 4.4, -1.5);
    const fanHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 0.8, roughness: 0.3 }),
    );
    this.ceilingFan.add(fanHub);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(
        createRoundedBoxGeometry(1.2, 0.04, 0.22, 0.01, true),
        new THREE.MeshStandardMaterial({ color: 0xb07c4a, roughness: 0.55 }),
      );
      blade.rotation.y = (b / 4) * Math.PI * 2;
      blade.position.set(Math.cos(blade.rotation.y) * 0.65, 0, Math.sin(blade.rotation.y) * 0.65);
      this.ceilingFan.add(blade);
    }
    floorGroup.add(this.ceilingFan);

    // Wall Clock on Back Wall
    const clockFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0xfff6e9, roughness: 0.3 }),
    );
    clockFace.rotation.x = Math.PI * 0.5;
    clockFace.position.set(0, 2.05, -6.32);
    const hand = new THREE.Mesh(
      createRoundedBoxGeometry(0.06, 0.32, 0.04, 0.01, false),
      new THREE.MeshStandardMaterial({ color: 0x16181d }),
    );
    hand.position.set(0, 2.05, -6.26);
    this.clockMinuteHand = hand;
    floorGroup.add(clockFace, hand);

    // Clipboard Bot Assistant near Break Room (§8.6)
    this.clipboardBot = createClipboardBotMesh();
    this.clipboardBot.position.set(this.sim.breakRoomPos.x - 1.2, 1.35, this.sim.breakRoomPos.z);
    floorGroup.add(this.clipboardBot);

    this.floorMesh = floorGroup as unknown as THREE.Mesh;
    this.scene.add(floorGroup);

    // Build all stations for this mart
    for (const bp of mart.stations) {
      const vis = this.buildStationVisual(bp);
      this.stationVisuals.set(bp.id, vis);
      this.scene.add(vis.unlockedGroup);
      this.scene.add(vis.ghostGroup);
    }
  }

  private buildStationVisual(bp: {
    id: string;
    type: string;
    label: string;
    x: number;
    z: number;
    unlockCost: number;
    productId?: string;
    machineId?: string;
    animalType?: 'hen' | 'cow';
  }): StationVisualGroup {
    const unlockedGroup = new THREE.Group();
    unlockedGroup.position.set(bp.x, 0, bp.z);

    const ghostGroup = new THREE.Group();
    ghostGroup.position.set(bp.x, 0, bp.z);

    // Ghost plot translucent frame + $COST badge (§1.4)
    const ghostFrame = new THREE.Mesh(
      createRoundedBoxGeometry(1.5, 0.14, 1.4, 0.05, false),
      new THREE.MeshStandardMaterial({
        color: 0xfff6e9,
        transparent: true,
        opacity: 0.45,
        roughness: 0.3,
      }),
    );
    ghostGroup.add(ghostFrame);

    if (bp.unlockCost > 0) {
      const badgeTex = createBadgeLabelTexture(
        `$${bp.unlockCost}`,
        bp.label.toUpperCase(),
        '#23324A',
      );
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: badgeTex, transparent: true }),
      );
      sprite.position.set(0, 1.15, 0);
      sprite.scale.set(1.65, 0.72, 1);
      ghostGroup.add(sprite);
    }

    const dynamicParts: THREE.Object3D[] = [];
    let progressRing: THREE.Mesh | undefined;
    let jamBadge: THREE.Sprite | undefined;
    let worriedSprite: THREE.Sprite | undefined;
    let welfareRing: THREE.Mesh | undefined;

    if (bp.type === 'crop') {
      const soil = new THREE.Mesh(
        createRoundedBoxGeometry(1.45, 0.22, 1.45, 0.06, false),
        new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 }),
      );
      soil.receiveShadow = true;
      unlockedGroup.add(soil);

      const pDef = getProduct(bp.productId ?? 'tomato');
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x4fa85c, roughness: 0.5 });
      const fruitMat = new THREE.MeshStandardMaterial({ color: pDef.primaryColor, roughness: 0.35 });

      for (let i = 0; i < 4; i++) {
        const px = (i % 2 === 0 ? -1 : 1) * 0.34;
        const pz = (i < 2 ? -1 : 1) * 0.34;
        const plantNode = new THREE.Group();
        plantNode.position.set(px, 0.22, pz);

        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), leafMat);
        bush.position.y = 0.16;
        bush.castShadow = true;
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), fruitMat);
        fruit.position.set(0, 0.36, 0.06);
        plantNode.add(bush, fruit);
        unlockedGroup.add(plantNode);
        dynamicParts.push(plantNode);
      }
    } else if (bp.type === 'animal') {
      const pad = new THREE.Mesh(
        createRoundedBoxGeometry(1.6, 0.16, 1.4, 0.06, false),
        new THREE.MeshStandardMaterial({ color: 0xb07c4a, roughness: 0.7 }),
      );
      unlockedGroup.add(pad);

      // Composite Toy Animal (Hen or Cow, §5.3 / §7.7)
      const animalRoot = new THREE.Group();
      animalRoot.position.set(-0.2, 0.16, 0);
      const isCow = bp.animalType === 'cow';
      const coatMat = new THREE.MeshStandardMaterial({
        color: isCow ? 0xfff6e9 : 0xffc65c,
        roughness: 0.5,
      });
      const body = new THREE.Mesh(
        createRoundedBoxGeometry(isCow ? 0.58 : 0.38, isCow ? 0.42 : 0.32, isCow ? 0.72 : 0.44, 0.1, false),
        coatMat,
      );
      body.castShadow = true;
      const head = new THREE.Mesh(
        createRoundedBoxGeometry(0.32, 0.28, 0.28, 0.08, false),
        coatMat,
      );
      head.position.set(0, isCow ? 0.34 : 0.26, isCow ? 0.36 : 0.22);
      const beakOrSnout = new THREE.Mesh(
        createRoundedBoxGeometry(0.18, 0.1, 0.14, 0.03, true),
        new THREE.MeshStandardMaterial({ color: isCow ? 0xff8b6b : 0xe8503a, roughness: 0.4 }),
      );
      beakOrSnout.position.set(0, isCow ? 0.42 : 0.36, isCow ? 0.52 : 0.36);
      animalRoot.add(body, head, beakOrSnout);
      unlockedGroup.add(animalRoot);
      dynamicParts.push(animalRoot);

      // Golden Welfare Buff Ring (§7.7)
      const wRing = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.78, 24),
        new THREE.MeshBasicMaterial({ color: 0xf2b33d, side: THREE.DoubleSide }),
      );
      wRing.rotation.x = -Math.PI * 0.5;
      wRing.position.y = 0.18;
      wRing.visible = false;
      unlockedGroup.add(wRing);
      welfareRing = wRing;
    } else if (bp.type === 'machine') {
      const mDef = getMachineDef(bp.machineId ?? 'blender');
      const chassis = new THREE.Mesh(
        createRoundedBoxGeometry(1.3, 1.05, 1.15, 0.1, false),
        new THREE.MeshStandardMaterial({
          color: mDef.chassisColor,
          roughness: 0.32,
          metalness: 0.35,
        }),
      );
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      unlockedGroup.add(chassis);

      const topSpinner = new THREE.Mesh(
        createRoundedBoxGeometry(0.65, 0.28, 0.65, 0.06, false),
        new THREE.MeshStandardMaterial({
          color: mDef.accentColor,
          roughness: 0.25,
          metalness: 0.6,
        }),
      );
      topSpinner.position.y = 1.05;
      unlockedGroup.add(topSpinner);
      dynamicParts.push(topSpinner);

      // Progress Ring on Machine Chassis (§7.5)
      const pRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.54, 24),
        new THREE.MeshBasicMaterial({ color: 0x4fa85c, side: THREE.DoubleSide }),
      );
      pRing.rotation.x = -Math.PI * 0.5;
      pRing.position.y = 1.36;
      unlockedGroup.add(pRing);
      progressRing = pRing;

      // Jammed Wrench Warning Sprite (§7.5)
      const jamTex = createBadgeLabelTexture('JAMMED!', 'WALK NEAR TO FIX', '#E8503A');
      jamBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: jamTex, transparent: true }));
      jamBadge.position.set(0, 1.9, 0);
      jamBadge.scale.set(1.5, 0.65, 1);
      jamBadge.visible = false;
      unlockedGroup.add(jamBadge);
    } else if (bp.type === 'shelf') {
      const pDef = getProduct(bp.productId ?? 'tomato');
      const rack = new THREE.Mesh(
        createRoundedBoxGeometry(1.35, 0.92, 0.9, 0.07, false),
        new THREE.MeshStandardMaterial({ color: 0xb07c4a, roughness: 0.55 }),
      );
      rack.castShadow = true;
      rack.receiveShadow = true;
      unlockedGroup.add(rack);

      // Warm practical shelf strip light (§5.5)
      const strip = new THREE.Mesh(
        createRoundedBoxGeometry(1.2, 0.06, 0.82, 0.02, true),
        new THREE.MeshStandardMaterial({
          color: 0xffe9c8,
          emissive: 0xffc65c,
          emissiveIntensity: 0.6,
        }),
      );
      strip.position.y = 0.94;
      unlockedGroup.add(strip);

      const itemMat = new THREE.MeshStandardMaterial({ color: pDef.primaryColor, roughness: 0.35 });
      const itemGeo = createRoundedBoxGeometry(0.24, 0.2, 0.24, 0.04, false);
      for (let i = 0; i < 8; i++) {
        const slotMesh = new THREE.Mesh(itemGeo, itemMat);
        const col = i % 4;
        const row = Math.floor(i / 4);
        slotMesh.position.set(-0.42 + col * 0.28, 0.96, -0.18 + row * 0.34);
        slotMesh.castShadow = true;
        unlockedGroup.add(slotMesh);
        dynamicParts.push(slotMesh);
      }

      // Empty-state warmth worried face sprite after 10s empty (§12)
      const worriedTex = createBadgeLabelTexture(pDef.name.toUpperCase(), 'RESTOCK ME', '#E8503A', true);
      worriedSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: worriedTex, transparent: true }),
      );
      worriedSprite.position.set(0, 1.55, 0);
      worriedSprite.scale.set(1.4, 0.62, 1);
      worriedSprite.visible = false;
      unlockedGroup.add(worriedSprite);
    } else if (bp.type === 'till') {
      const counter = new THREE.Mesh(
        createRoundedBoxGeometry(1.55, 0.88, 0.95, 0.08, false),
        new THREE.MeshStandardMaterial({ color: 0x23324a, roughness: 0.42 }),
      );
      counter.castShadow = true;
      counter.receiveShadow = true;
      unlockedGroup.add(counter);

      const regScreen = new THREE.Mesh(
        createRoundedBoxGeometry(0.42, 0.36, 0.28, 0.04, false),
        new THREE.MeshStandardMaterial({
          color: 0xc8ced6,
          emissive: 0x2e9e9b,
          emissiveIntensity: 0.35,
          metalness: 0.7,
          roughness: 0.25,
        }),
      );
      regScreen.position.set(-0.32, 0.88, 0);
      unlockedGroup.add(regScreen);

      // Physical Cash Stack Notes on Counter (§7.9)
      const noteMat = new THREE.MeshStandardMaterial({ color: 0x4fa85c, roughness: 0.4 });
      const noteGeo = createRoundedBoxGeometry(0.32, 0.07, 0.2, 0.02, false);
      for (let i = 0; i < 8; i++) {
        const note = new THREE.Mesh(noteGeo, noteMat);
        note.position.set(0.42, 0.88 + i * 0.075, 0);
        note.visible = false;
        unlockedGroup.add(note);
        dynamicParts.push(note);
      }
    } else if (bp.type === 'breakroom') {
      const rug = new THREE.Mesh(
        createRoundedBoxGeometry(2.2, 0.04, 2.0, 0.02, false),
        new THREE.MeshStandardMaterial({ color: 0x2e9e9b, roughness: 0.75 }),
      );
      const coffeeBar = new THREE.Mesh(
        createRoundedBoxGeometry(0.9, 0.85, 0.6, 0.06, false),
        new THREE.MeshStandardMaterial({ color: 0xb07c4a, roughness: 0.5 }),
      );
      coffeeBar.position.set(0.45, 0.04, 0.45);
      unlockedGroup.add(rug, coffeeBar);
    }

    return {
      id: bp.id,
      type: bp.type,
      unlockedGroup,
      ghostGroup,
      dynamicParts,
      progressRing,
      jamBadge,
      worriedSprite,
      welfareRing,
    };
  }

  public updateAndRender(dt: number): void {
    this.rebuildMartSceneIfNeeded();
    const reduceMotion = this.sim.save.settings.a11y.reduceMotion;

    // 1. Update Camera Choreography (Intro sweep, Orbit, Zoom, Manager Cam 72° schematic)
    if (this.introTimer < 2.5) {
      this.introTimer = Math.min(2.5, this.introTimer + dt);
    }
    const introT = this.introTimer / 2.5;
    const smoothIntro = 1 - Math.pow(1 - introT, 3);

    const targetBlend = this.managerCamActive ? 1 : 0;
    this.managerCamBlend += (targetBlend - this.managerCamBlend) * Math.min(1, dt * 6.5);

    this.idleOrbitSeconds += dt;
    if (this.idleOrbitSeconds > 4.0) {
      this.orbitYaw *= Math.pow(0.2, dt);
    }

    const baseDist = (15.2 / Math.max(0.75, Math.min(1.6, this.zoomFactor))) * (2 - smoothIntro * 1.0);
    const pitch = THREE.MathUtils.lerp(this.orbitPitch, 1.26, this.managerCamBlend); // 1.26 rad ≈ 72°
    const yaw = THREE.MathUtils.lerp(this.orbitYaw, 0, this.managerCamBlend);

    const focusX = THREE.MathUtils.lerp(this.sim.hero.x * 0.35, 0, this.managerCamBlend);
    const focusZ = THREE.MathUtils.lerp(this.sim.hero.z * 0.35 + 0.5, 0, this.managerCamBlend);

    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.5);
    const shakeOffset = reduceMotion ? 0 : Math.sin(this.sim.simTime * 55) * this.cameraShake * 0.08;

    const camX = focusX + Math.sin(yaw) * Math.cos(pitch) * baseDist + shakeOffset;
    const camY = Math.sin(pitch) * baseDist;
    const camZ = focusZ + Math.cos(yaw) * Math.cos(pitch) * baseDist;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(focusX, 0, focusZ);

    // 2. Sync Stations
    for (const c of this.sim.crops) {
      const vis = this.stationVisuals.get(c.id);
      if (!vis) continue;
      vis.unlockedGroup.visible = c.unlocked;
      vis.ghostGroup.visible = !c.unlocked;
      if (c.unlocked) {
        const stageScale = Math.max(0.28, c.availableUnits > 0 ? 1.0 : 0.3 + c.growthProgress * 0.7);
        vis.dynamicParts.forEach((p, idx) => {
          p.scale.setScalar(idx < c.availableUnits ? 1.0 : stageScale * 0.65);
        });
      }
    }

    for (const a of this.sim.animals) {
      const vis = this.stationVisuals.get(a.id);
      if (!vis) continue;
      vis.unlockedGroup.visible = a.unlocked;
      vis.ghostGroup.visible = !a.unlocked;
      if (a.unlocked) {
        const animRoot = vis.dynamicParts[0];
        if (animRoot && !reduceMotion) {
          animRoot.position.y = 0.16 + Math.abs(Math.sin(this.sim.simTime * 3.5)) * 0.06;
          animRoot.rotation.y = Math.sin(this.sim.simTime * 1.8) * 0.25;
        }
        if (vis.welfareRing) {
          vis.welfareRing.visible = a.welfareBuffActive;
        }
      }
    }

    for (const m of this.sim.machines) {
      const vis = this.stationVisuals.get(m.id);
      if (!vis) continue;
      vis.unlockedGroup.visible = m.unlocked;
      vis.ghostGroup.visible = !m.unlocked;
      if (m.unlocked) {
        const spinner = vis.dynamicParts[0];
        if (spinner && m.state === 'PROCESSING' && !reduceMotion) {
          spinner.rotation.y += dt * 4.5;
        }
        if (vis.progressRing) {
          vis.progressRing.visible = m.state === 'PROCESSING' || m.outputCount > 0;
          vis.progressRing.scale.setScalar(m.state === 'PROCESSING' ? 0.5 + m.progress * 0.5 : 1.0);
        }
        if (vis.jamBadge) {
          vis.jamBadge.visible = m.jammed;
        }
      }
    }

    for (const s of this.sim.shelves) {
      const vis = this.stationVisuals.get(s.id);
      if (!vis) continue;
      vis.unlockedGroup.visible = s.unlocked;
      vis.ghostGroup.visible = !s.unlocked;
      if (s.unlocked) {
        vis.dynamicParts.forEach((slotMesh, idx) => {
          slotMesh.visible = idx < s.stock;
        });
        if (vis.worriedSprite) {
          vis.worriedSprite.visible = s.emptyDurationSeconds >= 10.0;
        }
      }
    }

    for (const t of this.sim.tills) {
      const vis = this.stationVisuals.get(t.id);
      if (!vis) continue;
      vis.unlockedGroup.visible = t.unlocked;
      vis.ghostGroup.visible = !t.unlocked;
      if (t.unlocked) {
        const notesToShow = Math.min(vis.dynamicParts.length, Math.ceil(t.cashOnCounter / 25));
        vis.dynamicParts.forEach((note, idx) => {
          note.visible = idx < notesToShow;
        });
      }
    }

    // 3. Update Hero, Staff, Customers, and Thief rigs
    updateCharacterRig(
      this.heroVis,
      this.sim.hero.x,
      this.sim.hero.z,
      this.sim.hero.facingAngle,
      this.sim.hero.carrying,
      this.sim.hero.squashImpulse,
      dt,
      this.sim.simTime,
      reduceMotion,
    );

    // Sync Staff Rigs
    const activeStaffIds = new Set<string>();
    for (const st of this.sim.staff) {
      activeStaffIds.add(st.id);
      let stVis = this.staffVisMap.get(st.id);
      if (!stVis) {
        const classDef = STAFF_CLASS_MAP.get(st.role);
        stVis = createCharacterRig({
          bodyColor: classDef?.uniformColor ?? 0x2e9e9b,
          role: st.role,
          tier: st.tier,
          contactShadowTex: this.contactShadowTex,
        });
        this.staffVisMap.set(st.id, stVis);
        this.scene.add(stVis.root);
      }
      updateCharacterRig(
        stVis,
        st.x,
        st.z,
        st.facingAngle,
        st.carrying,
        0,
        dt,
        this.sim.simTime,
        reduceMotion,
      );
    }
    for (const [id, vis] of this.staffVisMap.entries()) {
      if (!activeStaffIds.has(id)) {
        this.scene.remove(vis.root);
        this.staffVisMap.delete(id);
      }
    }

    // Sync Customer Rigs
    const activeCustIds = new Set<string>();
    for (const c of this.sim.customers) {
      activeCustIds.add(c.id);
      let cVis = this.customerVisMap.get(c.id);
      if (!cVis) {
        cVis = createCharacterRig({
          bodyColor: c.shirtColor,
          role: 'customer',
          contactShadowTex: this.contactShadowTex,
        });
        this.customerVisMap.set(c.id, cVis);
        this.scene.add(cVis.root);
      }
      updateCharacterRig(
        cVis,
        c.x,
        c.z,
        c.facingAngle,
        c.basket,
        0,
        dt,
        this.sim.simTime,
        reduceMotion,
      );
    }
    for (const [id, vis] of this.customerVisMap.entries()) {
      if (!activeCustIds.has(id)) {
        this.scene.remove(vis.root);
        this.customerVisMap.delete(id);
      }
    }

    // Thief rig
    this.thiefVis.root.visible = this.sim.thief.active;
    if (this.sim.thief.active) {
      updateCharacterRig(
        this.thiefVis,
        this.sim.thief.x,
        this.sim.thief.z,
        this.sim.thief.facingAngle,
        [],
        0,
        dt,
        this.sim.simTime,
        reduceMotion,
      );
    }

    // 4. Environment Animations (Ceiling fan, Clock, Clipboard Bot, Tap Ripple, Particles)
    if (this.ceilingFan && !reduceMotion) {
      this.ceilingFan.rotation.y += dt * 1.6;
    }
    if (this.clockMinuteHand) {
      this.clockMinuteHand.rotation.z = -this.sim.simTime * 0.1;
    }
    if (this.clipboardBot) {
      this.clipboardBot.visible = (this.sim.save.upgrades.autoHire ?? 0) > 0;
      if (this.clipboardBot.visible && !reduceMotion) {
        this.clipboardBot.position.y = 1.35 + Math.sin(this.sim.simTime * 3.2) * 0.12;
        this.clipboardBot.rotation.y = Math.sin(this.sim.simTime * 1.5) * 0.35;
      }
    }

    if (this.rippleLife > 0) {
      this.rippleLife = Math.max(0, this.rippleLife - dt * 2.4);
      const s = 1 + (1 - this.rippleLife) * 2.2;
      this.rippleMesh.scale.setScalar(s);
      (this.rippleMesh.material as THREE.MeshBasicMaterial).opacity = this.rippleLife * 0.75;
    }

    // Update Pooled Burst Particles
    let dirtyBurst = false;
    for (let i = 0; i < this.burstPool.length; i++) {
      const p = this.burstPool[i]!;
      if (!p.active) continue;
      dirtyBurst = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.burstPositions[i * 3 + 1] = -999;
      } else {
        p.vy -= 6.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        this.burstPositions[i * 3] = p.x;
        this.burstPositions[i * 3 + 1] = p.y;
        this.burstPositions[i * 3 + 2] = p.z;
      }
    }
    if (dirtyBurst) {
      this.burstGeo.attributes.position!.needsUpdate = true;
    }

    // 5. Manager Cam Schematic Flow Arrows (§5.2)
    this.flowArrowGroup.visible = this.managerCamBlend > 0.25;
    if (this.flowArrowGroup.visible) {
      this.rebuildFlowArrows();
    }

    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.triangleCount = this.renderer.info.render.triangles;
  }

  private rebuildFlowArrows(): void {
    while (this.flowArrowGroup.children.length > 0) {
      this.flowArrowGroup.remove(this.flowArrowGroup.children[0]!);
    }
    const arrows = this.sim.getManagerFlowArrows();
    for (const a of arrows) {
      const dir = new THREE.Vector3(a.toX - a.fromX, 0, a.toZ - a.fromZ);
      const len = dir.length();
      if (len < 0.4) continue;
      dir.normalize();
      const color = a.kind === 'staff' ? 0xffc65c : 0x2e9e9b;
      const helper = new THREE.ArrowHelper(
        dir,
        new THREE.Vector3(a.fromX, 0.45, a.fromZ),
        Math.min(len, 3.2),
        color,
        0.35,
        0.22,
      );
      this.flowArrowGroup.add(helper);
    }
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    this.renderer.dispose();
  }
}
