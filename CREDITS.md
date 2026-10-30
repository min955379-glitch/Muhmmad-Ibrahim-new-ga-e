# CREDITS & ASSET PROVENANCE — MINI MART EVOLVED

## 1. Runtime 3D Geometry, Textures, Rig & Audio (100% Procedural Tier 0)
All shipped 3D meshes, character rigs, animations, surface textures, UI icons, and audio synthesis in **Mini Mart Evolved** are generated 100% procedurally in TypeScript code at runtime:
- **3D Models & Diorama Props**: Generated via `src/render/geometry-helpers.ts` (`THREE.ExtrudeGeometry` rounded bevels, `THREE.LatheGeometry`, composite multi-part `THREE.Group` hierarchies).
- **Character Rigs & Animations**: Generated via `src/characters/rig.ts` (chunky rounded proportions, 2-bone leg IK stride, spring-damped spine lean, carry-stack sway, Poisson blink, and 6 distinct staff class silhouettes across 3 tiers).
- **Textures**: Generated via HTML5 2D `CanvasTexture` in `src/render/geometry-helpers.ts` (terrazzo tile floor with grout lines, soft radial contact shadows, floating price & status badges).
- **Audio & Adaptive Music**: Generated via the Web Audio API in `src/audio/engine.ts` (8 ASMR synthesis layers + 4 adaptive Markov music stems in D major pentatonic).

## 2. Open-Source Libraries
- **Three.js** (`three`) — MIT License
- **React & React DOM** (`react`, `react-dom`) — MIT License
- **Tailwind CSS** (`tailwindcss`) — MIT License
