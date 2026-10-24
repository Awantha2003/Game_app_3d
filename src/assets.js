// Loads the Blender-built .glb models from public/models and the ground and
// foliage textures from public/textures.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_NAMES = [
  'soldier_army', 'soldier_ltte', 'civilian', 'buffel', 'seatiger_boat', 'bunker', 'earth_bund',
  'house', 'house_ruined', 'water_tower', 'sluice_gate', 'palm_coconut', 'palm_palmyrah',
  'tree_jungle', 'bush', 'rock_outcrop', 'rock_small', 'supplies', 'sandbag_wall',
  'watchtower', 'alarm', 'soldier_sf', 'soldier_ghillie', 'wpn_svd', 'wpn_pistol', 'helicopter', 'arrow_boat', 'grenade',
  'tree_rain2', 'fern', 'banana', 'fallen_log', 'hut', 'wpn_lmg', 'artillery', 'wpn_t56',
];

const TEXTURE_NAMES = [
  'ground_grass', 'ground_drygrass', 'ground_dirt', 'ground_mud', 'ground_sand', 'ground_paddy',
  'ground_grass_n', 'ground_dirt_n', 'grass_card', 'grass_card_dry', 'leaf_litter',
];

export const models = {};
export const textures = {};

// Shared wind uniforms for every foliage shader: time and strength.
export const WIND = { time: { value: 0 }, strength: { value: 1 } };

// How far each kind of foliage bends: trunk sway grows with height above the
// model's base, flutter is a small fast jitter of the leaves.
const SWAY = { canopy: 0.012, canopy2: 0.012, canopy3: 0.016, vine: 0.03, frond: 0.02, frond_dry: 0.02, fan: 0.014, fan_dry: 0.01, shrub: 0.05, fern: 0.08, banana: 0.04 };

// Alpha-tested, double-sided, wind-animated leaves.
export function makeFoliage(m, sway = 0.02, flutter = 0.03) {
  m.alphaTest = 0.5;
  m.transparent = false;
  m.side = THREE.DoubleSide;
  m.shadowSide = THREE.DoubleSide;
  m.roughness = 0.8;
  m.metalness = 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = WIND.time;
    sh.uniforms.uWindS = WIND.strength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindT;\nuniform float uWindS;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 wOrig = instanceMatrix[3].xz;
        #else
          vec2 wOrig = modelMatrix[3].xz;
        #endif
        float wH = max(0.0, position.y);
        float wPh = wOrig.x * 0.21 + wOrig.y * 0.17;
        float wSway = sin(uWindT * 1.1 + wPh) + 0.45 * sin(uWindT * 2.3 + wPh * 1.7);
        float wFl = sin(uWindT * 6.5 + position.x * 3.1 + position.z * 2.3 + wPh);
        transformed.x += uWindS * (${sway.toFixed(4)} * pow(wH, 1.4) * wSway + ${flutter.toFixed(4)} * wFl);
        transformed.z += uWindS * (${(sway * 0.6).toFixed(4)} * pow(wH, 1.4) * cos(uWindT * 0.9 + wPh) + ${flutter.toFixed(4)} * cos(uWindT * 5.7 + position.y * 4.0));`);
  };
  m.customProgramCacheKey = () => `foliage${sway}${flutter}`;
  m.needsUpdate = true;
  return m;
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  let done = 0;
  const total = MODEL_NAMES.length + TEXTURE_NAMES.length;
  const tick = () => onProgress?.(++done / total);
  await Promise.all([
    ...MODEL_NAMES.map(async (name) => {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const m = o.material;
        if (m.map) {
          m.map.anisotropy = 8;
          m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        }
        if (m.name.startsWith('foliage_')) {
          const kind = m.name.slice(8);
          makeFoliage(m, SWAY[kind] ?? 0.02, kind.startsWith('canopy') ? 0.04 : 0.025);
          // texture-authored greens read a little dark under ACES
          m.color.setScalar(1.25);
        }
      });
      models[name] = gltf.scene;
      tick();
    }),
    ...TEXTURE_NAMES.map(async (name) => {
      const t = await tl.loadAsync(`${import.meta.env.BASE_URL}textures/${name}.png`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (!name.endsWith('_n')) t.colorSpace = THREE.SRGBColorSpace;
      textures[name] = t;
      tick();
    }),
  ]);
}

// Returns [{geometry, material, matrix}] for every mesh in a model, with each
// matrix relative to the model root. Used to build InstancedMeshes.
export function meshParts(name) {
  const root = models[name];
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
  });
  return parts;
}
