/**
 * Procedural Geometry & Texture Kit (§5.4, §13.2)
 * - Rounded-bevel geometry helpers (ExtrudeGeometry + LatheGeometry)
 * - Procedural CanvasTextures (Terrazzo floor, Wood grain, Contact shadow blob, Price tags)
 * - Zero external image files
 */

import * as THREE from 'three';

const geometryCache = new Map<string, THREE.BufferGeometry>();

/**
 * Builds a bevelled, rounded-corner 3D box centered on X/Z and sitting with bottom at Y=0 (or centered if centerY=true)
 */
export function createRoundedBoxGeometry(
  w: number,
  h: number,
  d: number,
  radius = 0.06,
  centerY = true,
): THREE.BufferGeometry {
  const key = `rbox_${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}_${radius.toFixed(3)}_${centerY ? 1 : 0}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const r = Math.min(radius, w * 0.35, d * 0.35, h * 0.35);
  const innerW = Math.max(0.02, w - r * 2);
  const innerD = Math.max(0.02, d - r * 2);

  const shape = new THREE.Shape();
  const hw = innerW * 0.5;
  const hd = innerD * 0.5;

  shape.moveTo(-hw, -hd - r);
  shape.lineTo(hw, -hd - r);
  shape.quadraticCurveTo(hw + r, -hd - r, hw + r, -hd);
  shape.lineTo(hw + r, hd);
  shape.quadraticCurveTo(hw + r, hd + r, hw, hd + r);
  shape.lineTo(-hw, hd + r);
  shape.quadraticCurveTo(-hw - r, hd + r, -hw - r, hd);
  shape.lineTo(-hw - r, -hd);
  shape.quadraticCurveTo(-hw - r, -hd - r, -hw, -hd - r);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, h - r * 2),
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: r * 0.65,
    bevelThickness: r,
  });

  geo.rotateX(-Math.PI * 0.5);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  const cy = centerY ? (bb.min.y + bb.max.y) * 0.5 : bb.min.y;
  geo.translate(-cx, -cy, -cz);
  geo.computeVertexNormals();

  geometryCache.set(key, geo);
  return geo;
}

/**
 * Generates a 512x512 tiled checker/terrazzo floor texture with grout lines (§5.4)
 */
export function createTerrazzoFloorTexture(
  primaryHex: number,
  secondaryHex: number,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const c1 = '#' + primaryHex.toString(16).padStart(6, '0');
  const c2 = '#' + secondaryHex.toString(16).padStart(6, '0');

  const tileSize = 128;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? c1 : c2;
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);

      // Grout border
      ctx.strokeStyle = 'rgba(22, 24, 29, 0.09)';
      ctx.lineWidth = 3;
      ctx.strokeRect(col * tileSize + 1.5, row * tileSize + 1.5, tileSize - 3, tileSize - 3);
    }
  }

  // Terrazzo flecks (deterministic pseudo-random)
  let seed = 0x98765432;
  const fleckColors = ['rgba(255,255,255,0.45)', 'rgba(176,124,74,0.18)', 'rgba(46,158,155,0.15)'];
  for (let i = 0; i < 240; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = (seed & 0x1ff);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const y = (seed & 0x1ff);
    const r = 1.5 + (i % 3);
    ctx.fillStyle = fleckColors[i % fleckColors.length]!;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates a soft radial contact shadow texture (§5.5)
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(16, 18, 24, 0.52)');
  grad.addColorStop(0.55, 'rgba(16, 18, 24, 0.22)');
  grad.addColorStop(1, 'rgba(16, 18, 24, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates an in-world floating badge / price-tag texture (supports worried face for empty shelves >10s, §12)
 */
export function createBadgeLabelTexture(
  mainText: string,
  subText: string,
  bgColorHex: string,
  worriedFace = false,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 112);

  // Rounded badge pill
  ctx.fillStyle = bgColorHex;
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 96, 22);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 246, 233, 0.85)';
  ctx.stroke();

  ctx.fillStyle = '#FFF6E9';
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(worriedFace ? `${mainText} 😟` : mainText, 128, 42);

  ctx.fillStyle = 'rgba(255, 246, 233, 0.88)';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(subText, 128, 78);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
