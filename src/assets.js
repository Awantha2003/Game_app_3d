// Loads the Blender-built .glb models from public/models.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_NAMES = [
  'soldier_army', 'soldier_ltte', 'civilian', 'buffel', 'seatiger_boat', 'bunker', 'earth_bund',
  'house', 'house_ruined', 'water_tower', 'sluice_gate', 'palm_coconut', 'palm_palmyrah',
  'tree_jungle', 'bush', 'rock_outcrop', 'rock_small', 'supplies', 'sandbag_wall',
  'watchtower', 'alarm', 'soldier_sf', 'soldier_ghillie', 'wpn_svd', 'wpn_pistol', 'helicopter', 'arrow_boat', 'grenade',
];

export const models = {};

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(MODEL_NAMES.map(async (name) => {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const m = o.material;
        if (m.map) {
          m.map.anisotropy = 4;
          m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        }
      }
    });
    models[name] = gltf.scene;
    onProgress?.(++done / MODEL_NAMES.length);
  }));
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
