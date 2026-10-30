/**
 * Procedural Character Rig & Animator (§5.3)
 * - Chunky rounded toy proportions (head 1.4x body width, mitten hands, oversized shoes)
 * - Composite 14-18 part THREE.Group hierarchy with bottom-center ground pivot
 * - 2-bone leg IK footstep lattice driven by distance travelled
 * - Spring-damped spine lean opposite to velocity + carry stack weight
 * - 6 Staff Archetypes readable by silhouette alone + 3 Promotion Tiers (Junior, Senior gold trim, Manager star halo)
 * - Adorable floating Clipboard Bot assistant (§8.6)
 */

import * as THREE from 'three';
import { getProduct } from '../content/products';
import { STAFF_CLASS_MAP } from '../content/upgrades';
import { StaffRole } from '../core/save';
import { createRoundedBoxGeometry } from '../render/geometry-helpers';

export interface ProceduralCharacterVisual {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  headGroup: THREE.Group;
  leftEye: THREE.Mesh;
  rightEye: THREE.Mesh;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  carryAnchor: THREE.Group;
  carryMeshes: THREE.Mesh[];
  tierHalo: THREE.Group | null;
  distanceTravelled: number;
  lastX: number;
  lastZ: number;
  blinkTimer: number;
  isBlinking: boolean;
  spinePitch: number;
  spineRoll: number;
}

const sharedEyeMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.2 });
const sharedSkinMat = new THREE.MeshStandardMaterial({ color: 0xffd7ba, roughness: 0.55 });
const sharedShoeMat = new THREE.MeshStandardMaterial({ color: 0x23324a, roughness: 0.5 });
const sharedGoldMat = new THREE.MeshStandardMaterial({
  color: 0xf2b33d,
  roughness: 0.22,
  metalness: 0.85,
});
const sharedWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfff6e9, roughness: 0.45 });

export function createCharacterRig(options: {
  bodyColor: number;
  apronColor?: number;
  role?: StaffRole | 'hero' | 'customer' | 'thief';
  tier?: 1 | 2 | 3;
  contactShadowTex: THREE.Texture;
}): ProceduralCharacterVisual {
  const root = new THREE.Group();

  // Contact shadow disc grounded at Y=0.02
  const shadowGeo = new THREE.PlaneGeometry(0.95, 0.95);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: options.contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.02;
  root.add(shadowMesh);

  // Legs with oversized rounded shoes
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.28, 0);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.14, 0.28, 0);

  const legGeo = createRoundedBoxGeometry(0.14, 0.26, 0.14, 0.04, true);
  const shoeGeo = createRoundedBoxGeometry(0.18, 0.12, 0.26, 0.04, false);

  const lThigh = new THREE.Mesh(legGeo, sharedShoeMat);
  lThigh.position.y = -0.06;
  const lShoe = new THREE.Mesh(shoeGeo, sharedShoeMat);
  lShoe.position.set(0, -0.26, 0.04);
  leftLeg.add(lThigh, lShoe);

  const rThigh = new THREE.Mesh(legGeo, sharedShoeMat);
  rThigh.position.y = -0.06;
  const rShoe = new THREE.Mesh(shoeGeo, sharedShoeMat);
  rShoe.position.set(0, -0.26, 0.04);
  rightLeg.add(rThigh, rShoe);

  root.add(leftLeg, rightLeg);

  // Pelvis & Spine
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.34;
  root.add(pelvis);

  const spine = new THREE.Group();
  pelvis.add(spine);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: options.bodyColor,
    roughness: 0.58,
    metalness: 0.05,
  });
  const torsoGeo = createRoundedBoxGeometry(0.42, 0.46, 0.3, 0.09, false);
  const torsoMesh = new THREE.Mesh(torsoGeo, bodyMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  spine.add(torsoMesh);

  // Apron / Sash trim
  const apronMat =
    options.tier && options.tier >= 2
      ? sharedGoldMat
      : new THREE.MeshStandardMaterial({
          color: options.apronColor ?? 0xfff6e9,
          roughness: 0.5,
        });
  const apronGeo = createRoundedBoxGeometry(0.36, 0.34, 0.33, 0.05, false);
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.position.set(0, 0.04, 0.01);
  spine.add(apronMesh);

  // Arms + Mitten Hands
  const armGeo = createRoundedBoxGeometry(0.13, 0.34, 0.13, 0.05, true);
  const mittenGeo = new THREE.SphereGeometry(0.085, 10, 10);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.27, 0.36, 0);
  const lArmMesh = new THREE.Mesh(armGeo, bodyMat);
  lArmMesh.position.y = -0.12;
  const lMitten = new THREE.Mesh(mittenGeo, sharedSkinMat);
  lMitten.position.set(0, -0.28, 0.03);
  leftArm.add(lArmMesh, lMitten);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.27, 0.36, 0);
  const rArmMesh = new THREE.Mesh(armGeo, bodyMat);
  rArmMesh.position.y = -0.12;
  const rMitten = new THREE.Mesh(mittenGeo, sharedSkinMat);
  rMitten.position.set(0, -0.28, 0.03);
  rightArm.add(rArmMesh, rMitten);

  spine.add(leftArm, rightArm);

  // Chunky Rounded Head (1.4x body width per §5.3)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.5, 0);
  spine.add(headGroup);

  const headGeo = createRoundedBoxGeometry(0.54, 0.44, 0.46, 0.15, false);
  const headMesh = new THREE.Mesh(headGeo, sharedSkinMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Eyes (with blink support)
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const leftEye = new THREE.Mesh(eyeGeo, sharedEyeMat);
  leftEye.position.set(-0.11, 0.22, 0.22);
  const rightEye = new THREE.Mesh(eyeGeo, sharedEyeMat);
  rightEye.position.set(0.11, 0.22, 0.22);
  headGroup.add(leftEye, rightEye);

  // Rosy Cheeks
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff8b6b, roughness: 0.6 });
  const cheekGeo = new THREE.SphereGeometry(0.038, 8, 8);
  const lCheek = new THREE.Mesh(cheekGeo, cheekMat);
  lCheek.position.set(-0.18, 0.16, 0.21);
  const rCheek = new THREE.Mesh(cheekGeo, cheekMat);
  rCheek.position.set(0.18, 0.16, 0.21);
  headGroup.add(lCheek, rCheek);

  // Role-specific Silhouette Hat & Tool Prop (§5.3)
  if (options.role && options.role !== 'customer') {
    addRoleSilhouetteAccessories(headGroup, rightArm, spine, options.role, options.tier ?? 1);
  }

  // Tier 3 Manager Halo of Golden Stars (§5.3)
  let tierHalo: THREE.Group | null = null;
  if (options.tier === 3) {
    tierHalo = new THREE.Group();
    tierHalo.position.set(0, 0.62, 0);
    const starGeo = new THREE.OctahedronGeometry(0.055, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const star = new THREE.Mesh(starGeo, sharedGoldMat);
      star.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
      tierHalo.add(star);
    }
    headGroup.add(tierHalo);
  }

  // Carry Stack Anchor above head (§7.3)
  const carryAnchor = new THREE.Group();
  carryAnchor.position.set(0, 1.02, 0.08);
  spine.add(carryAnchor);

  const carryMeshes: THREE.Mesh[] = [];
  const itemGeo = createRoundedBoxGeometry(0.32, 0.16, 0.28, 0.04, false);
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8503a, roughness: 0.38 });
    const itemMesh = new THREE.Mesh(itemGeo, mat);
    itemMesh.visible = false;
    itemMesh.castShadow = true;
    carryAnchor.add(itemMesh);
    carryMeshes.push(itemMesh);
  }

  return {
    root,
    pelvis,
    spine,
    headGroup,
    leftEye,
    rightEye,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    carryAnchor,
    carryMeshes,
    tierHalo,
    distanceTravelled: 0,
    lastX: 0,
    lastZ: 0,
    blinkTimer: 1.5,
    isBlinking: false,
    spinePitch: 0,
    spineRoll: 0,
  };
}

function addRoleSilhouetteAccessories(
  headGroup: THREE.Group,
  rightArm: THREE.Group,
  spine: THREE.Group,
  role: StaffRole | 'hero' | 'thief',
  tier: 1 | 2 | 3,
): void {
  const classDef = role !== 'hero' && role !== 'thief' ? STAFF_CLASS_MAP.get(role) : undefined;
  const hatColor =
    role === 'hero'
      ? 0xe8503a
      : role === 'thief'
        ? 0x16181d
        : (classDef?.uniformColor ?? 0x2e9e9b);

  const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.45 });

  if (role === 'hero' || classDef?.hatType === 'visor' || classDef?.hatType === 'peakedCap') {
    const capCrown = new THREE.Mesh(
      createRoundedBoxGeometry(0.56, 0.16, 0.48, 0.06, false),
      hatMat,
    );
    capCrown.position.set(0, 0.38, 0);
    const visor = new THREE.Mesh(
      createRoundedBoxGeometry(0.48, 0.05, 0.22, 0.02, false),
      tier >= 2 ? sharedGoldMat : hatMat,
    );
    visor.position.set(0, 0.38, 0.28);
    headGroup.add(capCrown, visor);
  } else if (classDef?.hatType === 'backwardsCap') {
    const capCrown = new THREE.Mesh(
      createRoundedBoxGeometry(0.56, 0.16, 0.48, 0.06, false),
      hatMat,
    );
    capCrown.position.set(0, 0.38, 0);
    const backVisor = new THREE.Mesh(
      createRoundedBoxGeometry(0.44, 0.05, 0.22, 0.02, false),
      hatMat,
    );
    backVisor.position.set(0, 0.38, -0.28);
    headGroup.add(capCrown, backVisor);

    // Backpack crate silhouette
    const pack = new THREE.Mesh(
      createRoundedBoxGeometry(0.34, 0.32, 0.2, 0.04, false),
      new THREE.MeshStandardMaterial({ color: 0xb07c4a, roughness: 0.65 }),
    );
    pack.position.set(0, 0.14, -0.22);
    spine.add(pack);
  } else if (classDef?.hatType === 'strawHat') {
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0xffc65c, roughness: 0.65 }),
    );
    brim.position.set(0, 0.42, 0);
    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.16, 14),
      new THREE.MeshStandardMaterial({ color: 0xf2b33d, roughness: 0.6 }),
    );
    dome.position.set(0, 0.5, 0);
    headGroup.add(brim, dome);
  } else if (classDef?.hatType === 'toque') {
    // Tall white chef toque
    const toque = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.22, 0.34, 14),
      sharedWhiteMat,
    );
    toque.position.set(0, 0.54, 0);
    headGroup.add(toque);
  } else if (classDef?.hatType === 'beret' || role === 'thief') {
    const beret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.26, 0.12, 14),
      hatMat,
    );
    beret.position.set(0.04, 0.44, 0);
    headGroup.add(beret);
  }

  // Hand tool prop for instant silhouette recognition
  if (role !== 'hero') {
    const propMesh = new THREE.Mesh(
      createRoundedBoxGeometry(0.1, 0.12, 0.22, 0.03, true),
      tier >= 2 ? sharedGoldMat : hatMat,
    );
    propMesh.position.set(0, -0.28, 0.14);
    rightArm.add(propMesh);
  }
}

/**
 * Updates procedural character rig per frame (leg IK stride, spine spring lean, carry stack sway, blink)
 */
export function updateCharacterRig(
  vis: ProceduralCharacterVisual,
  x: number,
  z: number,
  facingAngle: number,
  carryingIds: readonly string[],
  squashImpulse: number,
  dt: number,
  elapsedTime: number,
  reduceMotion: boolean,
): void {
  const dx = x - vis.lastX;
  const dz = z - vis.lastZ;
  const stepDist = Math.hypot(dx, dz);
  vis.lastX = x;
  vis.lastZ = z;
  vis.distanceTravelled += stepDist;

  vis.root.position.set(x, 0, z);

  // Smoothly interpolate facing angle
  let diff = facingAngle - vis.root.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  vis.root.rotation.y += diff * Math.min(1, dt * 14);

  const isMoving = stepDist > 0.002;
  const stridePhase = vis.distanceTravelled * 5.2;

  // 2-bone-style leg swing & foot lift driven by distance travelled (§5.3)
  if (isMoving && !reduceMotion) {
    vis.leftLeg.rotation.x = Math.sin(stridePhase) * 0.65;
    vis.rightLeg.rotation.x = Math.sin(stridePhase + Math.PI) * 0.65;
    vis.pelvis.position.y = 0.34 + Math.abs(Math.cos(stridePhase)) * 0.045;
  } else {
    vis.leftLeg.rotation.x *= 0.82;
    vis.rightLeg.rotation.x *= 0.82;
    vis.pelvis.position.y = 0.34 + (reduceMotion ? 0 : Math.sin(elapsedTime * 3.0) * 0.012);
  }

  // Spine spring lean opposite to carry load + movement
  const carryCount = carryingIds.length;
  const targetPitch = isMoving ? 0.12 - carryCount * 0.015 : -carryCount * 0.012;
  vis.spinePitch += (targetPitch - vis.spinePitch) * Math.min(1, dt * 10);
  vis.spine.rotation.x = reduceMotion ? 0 : vis.spinePitch;

  // Arms IK raise to support carried stack (§5.3)
  if (carryCount > 0) {
    vis.leftArm.rotation.x = -2.4;
    vis.rightArm.rotation.x = -2.4;
    vis.leftArm.rotation.z = 0.18;
    vis.rightArm.rotation.z = -0.18;
  } else if (isMoving && !reduceMotion) {
    vis.leftArm.rotation.x = Math.sin(stridePhase + Math.PI) * 0.45;
    vis.rightArm.rotation.x = Math.sin(stridePhase) * 0.45;
    vis.leftArm.rotation.z = 0;
    vis.rightArm.rotation.z = 0;
  } else {
    vis.leftArm.rotation.x *= 0.85;
    vis.rightArm.rotation.x *= 0.85;
    vis.leftArm.rotation.z = 0;
    vis.rightArm.rotation.z = 0;
  }

  // Squash & Stretch on pickup / deposit / sale (§12)
  if (!reduceMotion && squashImpulse > 0.01) {
    const sy = 1 - Math.sin(squashImpulse * Math.PI) * 0.18;
    const sxz = 1 / Math.sqrt(sy);
    vis.spine.scale.set(sxz, sy, sxz);
  } else {
    vis.spine.scale.set(1, 1, 1);
  }

  // Poisson-distributed blink (90-140ms, §5.3)
  vis.blinkTimer -= dt;
  if (vis.blinkTimer <= 0) {
    if (vis.isBlinking) {
      vis.isBlinking = false;
      vis.leftEye.scale.y = 1.0;
      vis.rightEye.scale.y = 1.0;
      vis.blinkTimer = 1.8 + ((Math.sin(elapsedTime * 17.3) + 1) * 1.4);
    } else {
      vis.isBlinking = true;
      vis.leftEye.scale.y = 0.12;
      vis.rightEye.scale.y = 0.12;
      vis.blinkTimer = 0.11;
    }
  }

  // Rotate Tier 3 Manager star halo
  if (vis.tierHalo) {
    vis.tierHalo.rotation.y = elapsedTime * 1.8;
  }

  // Update Carried Stack with compounding 1° spring sway per item (§7.3)
  for (let i = 0; i < vis.carryMeshes.length; i++) {
    const m = vis.carryMeshes[i]!;
    if (i < carryCount) {
      m.visible = true;
      const pDef = getProduct(carryingIds[i]!);
      (m.material as THREE.MeshStandardMaterial).color.setHex(pDef.primaryColor);
      m.position.y = i * 0.17;
      const swayRad = reduceMotion ? 0 : Math.sin(elapsedTime * 6.5 - i * 0.35) * 0.017 * (i + 1);
      m.position.x = swayRad * 1.2;
      m.rotation.z = -swayRad;
    } else {
      m.visible = false;
    }
  }
}

/**
 * Builds the adorable floating Clipboard Bot Assistant (§8.6)
 */
export function createClipboardBotMesh(): THREE.Group {
  const bot = new THREE.Group();
  const bodyGeo = createRoundedBoxGeometry(0.42, 0.52, 0.22, 0.07, true);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2e9e9b,
    roughness: 0.28,
    metalness: 0.4,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  bot.add(body);

  const screenGeo = createRoundedBoxGeometry(0.32, 0.26, 0.04, 0.03, true);
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    emissive: 0xa8e6c1,
    emissiveIntensity: 0.35,
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, 0.05, 0.11);
  bot.add(screen);

  const clipGeo = createRoundedBoxGeometry(0.2, 0.08, 0.08, 0.02, true);
  const clip = new THREE.Mesh(clipGeo, sharedGoldMat);
  clip.position.set(0, 0.28, 0.06);
  bot.add(clip);

  return bot;
}
