// Builds a mission's world: terrain, water, lighting, instanced props and the
// simple collision shapes used for movement and bullets.

import * as THREE from 'three';
import { WIND, makeFoliage, meshParts, models, textures } from './assets.js';
import { atmosphereFor } from './atmosphere.js';
import { fbm, mulberry32 } from './noise.js';

// Collision shapes per model, in three.js model space before rotation/scale.
// c = vertical cylinder, b = box. h = height above the prop's base.
const COLLIDERS = {
  palm_coconut: [{ t: 'c', x: 0, z: 0, r: 0.3, h: 9 }],
  palm_palmyrah: [{ t: 'c', x: 0, z: 0, r: 0.3, h: 12 }],
  tree_jungle: [{ t: 'c', x: 0, z: 0, r: 0.45, h: 7 }],
  tree_rain2: [{ t: 'c', x: 0, z: 0, r: 0.32, h: 5 }],
  artillery: [{ t: 'c', x: 0, z: 0.2, r: 1.1, h: 1.6 }],
  fallen_log: [{ t: 'b', x: 0, z: 0, hw: 0.35, hd: 2.7, h: 0.6 }],
  hut: [{ t: 'b', x: 0, z: 0, hw: 2.25, hd: 1.75, h: 3.9 }],
  banana: [{ t: 'c', x: 0, z: 0, r: 0.14, h: 2.3 }],
  bush: [],
  fern: [],
  rock_outcrop: [{ t: 'c', x: 0, z: 0, r: 12, h: 12 }, { t: 'c', x: 6, z: -4, r: 5.5, h: 14 }, { t: 'c', x: -7, z: 3, r: 5.5, h: 6 }],
  rock_small: [{ t: 'c', x: 0, z: 0, r: 1.1, h: 0.9 }],
  house: [{ t: 'b', x: 0, z: 0, hw: 3.5, hd: 2.5, h: 4.5 }],
  house_ruined: [{ t: 'b', x: 0, z: 0, hw: 3.5, hd: 2.5, h: 1.6 }],
  bunker: [{ t: 'c', x: 0, z: 0, r: 1.85, h: 1.6 }],
  sandbag_wall: [{ t: 'b', x: 0, z: 0, hw: 1.9, hd: 0.22, h: 0.75 }],
  earth_bund: [{ t: 'b', x: 0, z: 0, hw: 10, hd: 2.6, h: 2.9 }],
  buffel: [{ t: 'b', x: 0, z: 0.1, hw: 1.2, hd: 2.3, h: 3.1 }],
  seatiger_boat: [{ t: 'b', x: 0, z: -0.1, hw: 1.2, hd: 4, h: 1.6 }],
  water_tower: [{ t: 'c', x: 0, z: 0, r: 1.4, h: 7.5 }, { t: 'b', x: 0, z: 9.8, hw: 1.3, hd: 7, h: 2.5 }, { t: 'c', x: 0.6, z: 18.5, r: 4, h: 7 }],
  sluice_gate: [{ t: 'b', x: 0, z: 0, hw: 8.75, hd: 2, h: 4.2 }],
  supplies: [{ t: 'b', x: 0.4, z: 0, hw: 1.0, hd: 0.7, h: 1 }],
  // only the legs block: the sentry on the platform must stay shootable
  watchtower: [1, -1].flatMap((a) => [1, -1].map((b) => ({ t: 'c', x: a * 1.2, z: b * 1.2, r: 0.16, h: 4.9 }))),
  alarm: [{ t: 'c', x: 0, z: 0, r: 0.25, h: 3.2 }],
};

export const TOWER_HEIGHT = 5.12;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// soft-edged camp clearings and the ambient shade under canopies, in metres
const CLEARING = { bunker: 6, house: 7, house_ruined: 7, hut: 5.5, sandbag_wall: 3.5, supplies: 3, watchtower: 4.5, buffel: 5, alarm: 2.5, sluice_gate: 9, water_tower: 6 };
const SHADE = { tree_jungle: 4.2, tree_rain2: 3.2, palm_coconut: 2, palm_palmyrah: 2.2, bush: 1.5, banana: 1.4, house: 4.5, hut: 3.4, rock_outcrop: 14, fern: 0.9 };
const SPLAT_RES = 512;
const COVER = new Set(['sandbag_wall', 'bunker', 'rock_small', 'house', 'house_ruined', 'hut', 'earth_bund', 'fallen_log',
  'tree_jungle', 'tree_rain2', 'palm_coconut', 'palm_palmyrah', 'buffel', 'supplies', 'water_tower', 'sluice_gate']);
const GRASS_COUNT = { low: 6000, medium: 13000, high: 22000 };
const TILES = 6;

function radialTexture(inner = 0, soft = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, inner, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(soft ? 0.5 : 0.8, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(scene, mission, seed = 1234, opts = {}) {
    this.scene = scene;
    this.mission = mission;
    this.cfg = mission.world;
    this.atm = atmosphereFor(mission.id);
    this.quality = opts.quality || 'high';
    this.renderer = opts.renderer || null;
    this.size = this.cfg.size;
    this.water = this.cfg.water;
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.placements = {};
    this.spawns = [];
    this.targets = [];
    this.supplies = [];
    this.alarms = [];
    this.towers = [];
    this.units = [];

    this.buildEnvironment();
    this.buildTerrain();
    mission.layout(this.api());
    this.dress();
    this.scatter(mission.world.border || 'palm_coconut', 90,
      { x0: -this.size - 50, x1: this.size + 50, z0: -this.size - 50, z1: this.size + 50 }, { ring: true });
    this.paintGround();
    this.buildInstances();
    this.buildGrass();
    this.buildLitter();
    this.buildHills();
    this.buildBlobs();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.userData.ownGeometry) o.geometry.dispose();
    });
    this.splatTex?.dispose();
    this.group.userData.grassGeo?.dispose();
    if (this.envRT) {
      if (this.scene.environment === this.envRT.texture) this.scene.environment = null;
      this.envRT.dispose();
    }
  }

  // Per-frame: keep the sky around the camera, cull distant grass tiles,
  // move the contact shadows with the units and ripple the water.
  update(dt, camera, time) {
    const cp = camera.position;
    this.sky.position.copy(cp);
    this.skyMat.uniforms.time.value = time;
    for (const t of this.grassTiles) t.visible = Math.hypot(t.userData.cx - cp.x, t.userData.cz - cp.z) < this.grassRange;
    if (this.waterMat?.normalMap) {
      const o = this.waterMat.normalMap.offset;
      o.x = (o.x + dt * 0.004) % 1;
      o.y = (o.y + dt * 0.0025) % 1;
    }
    this.updateBlobs();
  }

  height(x, z) {
    return this.cfg.height(x, z);
  }

  isWater(x, z, depth = 0.5) {
    return this.water !== null && this.height(x, z) < this.water - depth;
  }

  // ---------------------------------------------------------------- scene

  buildEnvironment() {
    const c = this.cfg, A = this.atm;
    const fogColor = new THREE.Color(A.fog[0]);
    this.scene.background = fogColor.clone();
    this.scene.fog = new THREE.Fog(fogColor, A.fog[1], A.fog[2]);
    const el = THREE.MathUtils.degToRad(A.sunElev), az = THREE.MathUtils.degToRad(A.sunAzim);
    // azimuth: 90 = east (+x), 180 = south (+z), 270 = west (-x)
    this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

    const hemi = new THREE.HemisphereLight(A.hemiSky, A.hemiGround, A.hemiIntensity);
    this.group.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(A.sunColor, A.sunIntensity);
    sun.castShadow = this.quality !== 'low';
    const res = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(res, res);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    this.sunOffset = this.sunDir.clone().multiplyScalar(130);
    this.group.add(sun, sun.target);
    this.sun = sun;
    this.baseLight = { sun: A.sunIntensity, hemi: A.hemiIntensity };

    // sky dome: gradient, sun glow and drifting clouds; its horizon is the fog
    // colour so the terrain fades into it without a seam
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(A.skyTop) }, horizon: { value: new THREE.Color(A.horizon) }, fogColor: { value: fogColor },
        sunDir: { value: this.sunDir }, sunColor: { value: new THREE.Color(A.sunColor) }, cloudColor: { value: new THREE.Color(A.cloudColor) },
        clouds: { value: A.clouds }, time: { value: 0 },
      },
      vertexShader: `varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top, horizon, fogColor, sunDir, sunColor, cloudColor; uniform float clouds, time; varying vec3 vDir;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p) * a; p = p * 2.07 + 13.1; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, top, pow(clamp(h / 0.9, 0.0, 1.0), 0.6));
          col = mix(fogColor, col, smoothstep(-0.02, 0.12, h));
          float sd = max(dot(d, sunDir), 0.0);
          float clear = 1.0 - clouds * 0.75;
          col += sunColor * (pow(sd, 900.0) * 8.0 * clear + pow(sd, 24.0) * 0.22 * clear + pow(sd, 4.0) * 0.1);
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(time * 0.006, time * 0.002);
            float n = fbm(uv);
            float cov = smoothstep(1.0 - clouds * 0.9 - 0.15, 1.05 - clouds * 0.6, n) * smoothstep(0.0, 0.2, h);
            vec3 cc = cloudColor * (0.72 + 0.4 * fbm(uv * 2.3 + 4.0)) + sunColor * pow(sd, 6.0) * 0.35;
            col = mix(col, cc, cov * 0.92);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat = skyMat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.userData.ownGeometry = true;
    this.group.add(this.sky);

    // image-based ambient light and reflections from the same sky
    if (this.renderer) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(this.sky.geometry, skyMat));
      this.envRT = pm.fromScene(envScene, 0.02, 0.1, 1000);
      pm.dispose();
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = A.envIntensity;
    }
  }

  followSun(pos) {
    this.sun.position.copy(pos).add(this.sunOffset);
    this.sun.target.position.copy(pos);
  }

  buildTerrain() {
    const S = (this.size + 70) * 2;
    this.terrainSize = S;
    const seg = 220;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // vertex colours carry the mission's ground tone and the paddy bund grid;
    // the textures supply the detail
    const [ca, cb] = this.cfg.ground.map((h) => new THREE.Color(h));
    const ref = ca.clone().lerp(cb, 0.5);
    const dark = new THREE.Color('#4d6a26');
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      col.copy(ca).lerp(cb, fbm(x * 0.05 + 7, z * 0.05));
      if (this.cfg.paddy) {
        const gx = Math.abs(((x + 1000) % 22) - 11), gz = Math.abs(((z + 1000) % 18) - 9);
        if (gx > 10.2 || gz > 8.2) col.lerp(dark, 0.6);
      }
      col.multiplyScalar(0.9 + fbm(x * 0.4, z * 0.4, 2) * 0.2);
      colors.set([col.r / ref.r, col.g / ref.g, col.b / ref.b].map((v) => Math.min(1.6, v) * 0.6), i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // splat map: r = dirt (tracks, clearings), g = mud, b = sand, a = canopy shade
    this.splat = new Uint8Array(SPLAT_RES * SPLAT_RES * 4);
    this.splatTex = new THREE.DataTexture(this.splat, SPLAT_RES, SPLAT_RES, THREE.RGBAFormat);
    this.splatTex.magFilter = this.splatTex.minFilter = THREE.LinearFilter;

    // tint the grass texture towards this mission's ground colour (linear space)
    const texAvg = new THREE.Color(this.cfg.paddy ? '#7ba338' : '#5b762e');
    const tint = new THREE.Vector3(ref.r / texAvg.r, ref.g / texAvg.g, ref.b / texAvg.b).multiplyScalar(0.82);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, normalMap: textures.ground_grass_n, normalScale: new THREE.Vector2(0.9, 0.9),
    });
    const T = textures;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        tGrass: { value: this.cfg.paddy ? T.ground_paddy : T.ground_grass }, tGrass2: { value: T.ground_grass }, tDry: { value: T.ground_drygrass },
        tDirt: { value: T.ground_dirt }, tMud: { value: T.ground_mud }, tSand: { value: T.ground_sand },
        tDirtN: { value: T.ground_dirt_n }, tSplat: { value: this.splatTex },
        uTint: { value: tint }, uDry: { value: this.atm.dryness }, uWet: { value: this.atm.wet }, uTerrS: { value: S },
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos;
          uniform sampler2D tGrass, tGrass2, tDry, tDirt, tMud, tSand, tDirtN, tSplat;
          uniform vec3 uTint; uniform float uDry, uWet, uTerrS;
          // two rotated scales per layer hide the texture repeat
          vec4 tex2(sampler2D t, vec2 w) {
            vec4 a = texture2D(t, w * 0.23);
            vec4 b = texture2D(t, mat2(0.8, -0.6, 0.6, 0.8) * w * 0.071 + 0.37);
            return mix(a, b, 0.45);
          }
          vec3 hblend(vec3 a, vec3 b, float w, float hb) {
            return mix(a, b, clamp((w - 0.5) * 3.0 + (hb - 0.5) * 1.6 + 0.5, 0.0, 1.0) * step(0.001, w));
          }`)
        .replace('#include <map_fragment>', `
          vec2 wp = vWPos.xz;
          vec4 sp = texture2D(tSplat, wp / uTerrS + 0.5);
          float macro = texture2D(tMud, wp * 0.009).r;
          float macro2 = texture2D(tDirt, wp * 0.021 + 0.3).g;
          vec3 grass = tex2(tGrass, wp).rgb * uTint * (vColor * 1.666);
          grass = mix(grass, tex2(tGrass2, wp).rgb * uTint, 0.25 * smoothstep(0.4, 0.6, macro));
          vec3 dry = tex2(tDry, wp).rgb;
          vec3 dirt = tex2(tDirt, wp).rgb, mud = tex2(tMud, wp).rgb, sand = tex2(tSand, wp).rgb;
          dirt = mix(dirt, vec3(dot(dirt, vec3(0.3, 0.55, 0.15))), 0.4) * 0.85;
          vec3 gcol = mix(grass, dry, clamp(uDry * 1.5 * smoothstep(0.3, 0.7, macro + macro2 * 0.4 - 0.1) + uDry * 0.25, 0.0, 1.0));
          gcol *= 0.85 + 0.3 * macro;
          gcol = hblend(gcol, dirt, sp.r, dot(dirt, vec3(0.9)));
          gcol = hblend(gcol, mud, sp.g, dot(mud, vec3(0.9)));
          gcol = hblend(gcol, sand, sp.b, dot(sand, vec3(0.8)));
          gcol *= 1.0 - sp.a * 0.42;
          float wetMask = uWet * clamp(0.45 + sp.r * 0.5 + sp.g * 0.6, 0.0, 1.0);
          float puddle = uWet * smoothstep(0.5, 0.58, macro2 * 0.7 + macro * 0.5) * clamp(max(sp.r, sp.g) * 1.5, 0.0, 1.0);
          gcol *= 1.0 - 0.32 * wetMask;
          gcol = mix(gcol, gcol * 0.35 + vec3(0.015, 0.02, 0.025), puddle);
          diffuseColor.rgb *= gcol;`)
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
          roughnessFactor = mix(roughnessFactor, 0.5, wetMask);
          roughnessFactor = mix(roughnessFactor, 0.06, puddle);`)
        .replace('#include <normal_fragment_maps>', `
          vec2 nuv = wp * 0.23;
          vec3 nG = texture2D(normalMap, nuv).xyz * 2.0 - 1.0;
          vec3 nD = texture2D(tDirtN, nuv).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(mix(nG, nD, clamp(sp.r + sp.g, 0.0, 1.0)));
          mapN.xy *= normalScale * (1.0 - puddle);
          mat3 tbnW = getTangentFrame(-vViewPosition, normal, nuv);
          normal = normalize(tbnW * mapN);`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData.ownGeometry = true;
    this.group.add(mesh);
    this.terrain = mesh;

    if (this.water !== null) {
      const wgeo = new THREE.PlaneGeometry(S * 3, S * 3);
      wgeo.rotateX(-Math.PI / 2);
      const nrm = textures.ground_grass_n.clone();
      nrm.repeat.set(160, 160);
      nrm.needsUpdate = true;
      this.waterMat = new THREE.MeshStandardMaterial({
        color: '#2f5a5e', roughness: 0.07, metalness: 0.1, transparent: true, opacity: 0.86,
        normalMap: nrm, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1.2,
      });
      const water = new THREE.Mesh(wgeo, this.waterMat);
      water.position.y = this.water;
      water.userData.ownGeometry = true;
      water.receiveShadow = true;
      this.group.add(water);
    }
  }

  // where the objectives are, in order, for the tracks that lead to them
  objectivePoints() {
    const pts = [];
    const centroid = (list) => list.length && [list.reduce((s, p) => s + p.x, 0) / list.length, list.reduce((s, p) => s + p.z, 0) / list.length];
    for (const o of this.mission.objectives) {
      let p = null;
      if (o.pos) p = o.pos;
      else if (o.reach) p = o.reach;
      else if (o.tag) {
        p = centroid(this.targets.filter((t) => t.tag === o.tag))
          || centroid(this.spawns.filter((s) => s.tag === o.tag))
          || centroid((o.spawn || []).map((s) => ({ x: s.x, z: s.z })));
      }
      if (p) pts.push(p);
      if (o.zone) pts.push([o.zone[0], o.zone[1]]);
    }
    return pts;
  }

  splatAt(x, z, ch) {
    const S = this.terrainSize;
    const i = Math.floor((x / S + 0.5) * SPLAT_RES), j = Math.floor((z / S + 0.5) * SPLAT_RES);
    if (i < 0 || j < 0 || i >= SPLAT_RES || j >= SPLAT_RES) return 0;
    return this.splat[(j * SPLAT_RES + i) * 4 + ch] / 255;
  }

  // Paint the splat map once the layout is known: tracks between the
  // objectives, cleared ground around camps, shore sand, mud and shade.
  paintGround() {
    const S = this.terrainSize, N = SPLAT_RES, cell = S / N, d = this.splat, W = this.water;
    const stamp = (x, z, r, ch, k = 1, rough = 0.8) => {
      const i0 = Math.max(0, Math.floor((x - r) / cell + N / 2)), i1 = Math.min(N - 1, Math.ceil((x + r) / cell + N / 2));
      const j0 = Math.max(0, Math.floor((z - r) / cell + N / 2)), j1 = Math.min(N - 1, Math.ceil((z + r) / cell + N / 2));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const wx = (i + 0.5 - N / 2) * cell, wz = (j + 0.5 - N / 2) * cell;
          const dd = Math.hypot(wx - x, wz - z) / r;
          if (dd >= 1) continue;
          const v = Math.min(1, Math.max(0, (1 - dd) * 1.8 * k + (fbm(wx * 0.35, wz * 0.35, 2) - 0.5) * rough));
          const o = (j * N + i) * 4 + ch;
          d[o] = Math.max(d[o], v * 255);
        }
      }
    };
    // shoreline sand and submerged mud
    if (W !== null) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const wx = (i + 0.5 - N / 2) * cell, wz = (j + 0.5 - N / 2) * cell;
          const h = this.height(wx, wz), o = (j * N + i) * 4;
          if (h < W + 0.9) d[o + 2] = Math.min(255, (W + 0.9 - h) * 1.4 * 255);
          if (h < W - 0.15) d[o + 1] = Math.min(255, (W - 0.15 - h) * 2 * 255);
        }
      }
    }
    // tracks: start -> each objective, wandering a little like a real footpath
    const rng = mulberry32(99);
    let prev = [this.mission.player.x, this.mission.player.z];
    const roads = [...(this.cfg.roads || [])];
    for (const p of this.objectivePoints()) {
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 6) roads.push([prev, p]);
      prev = p;
    }
    const wet = this.atm.wet > 0;
    for (const road of roads) {
      for (let s = 0; s + 1 < road.length; s++) {
        const [ax, az] = road[s], [bx, bz] = road[s + 1];
        const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len, seed = rng() * 100;
        for (let t = 0; t <= len; t += 0.6) {
          const k = t / len;
          const wob = (fbm(seed + t * 0.025, 3.3) - 0.5) * 14 * Math.sin(Math.PI * k);
          const x = ax + (bx - ax) * k + nx * wob, z = az + (bz - az) * k + nz * wob;
          if (this.isWater(x, z, 0.1)) continue;
          const wdt = 1.1 + fbm(t * 0.1, seed) * 1.0;
          stamp(x, z, wdt, 0, 0.75, 1.1);
          if (wet) stamp(x, z, wdt * 0.7, 1, 0.7, 0.9);
        }
      }
    }
    for (const [type, list] of Object.entries(this.placements)) {
      const r = CLEARING[type], sh = SHADE[type];
      for (const p of list) {
        if (r) stamp(p.x, p.z, r * p.scale, 0, 0.8, 0.9);
        if (r && wet) stamp(p.x, p.z, r * 0.6 * p.scale, 1, 0.6, 1);
        if (sh) stamp(p.x, p.z, sh * p.scale, 3, 0.55, 0.3);
      }
    }
    this.splatTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- layout API

  api() {
    const w = this;
    return {
      rng: () => w.rng(),
      prop: (type, x, z, rot = 0, scale = 1) => w.addProp(type, x, z, rot, scale),
      scatter: (type, n, area, opts) => w.scatter(type, n, area, opts),
      enemies: (n, x, z, spread, tag, opts) => w.addSpawns('ltte', n, x, z, spread, tag, opts),
      tower: (x, z, rot, tag) => w.addTower(x, z, rot, tag),
      alarm: (x, z, rot, tag) => w.addAlarm(x, z, rot, tag),
      friendlies: (n, x, z, spread) => w.addSpawns('army', n, x, z, spread, 'linkup'),
      civilians: (n, x, z, spread) => w.addSpawns('civ', n, x, z, spread, 'civ'),
      target: (tag, x, z, opts = {}) => w.addTarget(tag, x, z, opts),
    };
  }

  addProp(type, x, z, rot = 0, scale = 1) {
    const y = this.height(x, z);
    (this.placements[type] ||= []).push({ x, y, z, rot, scale });
    this.addColliders(type, x, y, z, rot, scale);
    if (type === 'supplies') this.supplies.push({ x, z });
  }

  addColliders(type, x, y, z, rot, scale, ref = null) {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (const s of COLLIDERS[type] || []) {
      const lx = s.x * scale, lz = s.z * scale;
      const c = {
        t: s.t, x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos,
        y0: y - 0.5, y1: y + s.h * scale, rot, ref, type,
      };
      if (s.t === 'c') c.r = s.r * scale;
      else { c.hw = s.hw * scale; c.hd = s.hd * scale; }
      this.colliders.push(c);
    }
  }

  // A spot behind a wall, rock, tree or building, on the far side from the
  // threat and within maxD of pos, that really blocks the threat's line of
  // sight at crouching height. Returns {x, z} or null.
  findCover(pos, threat, maxD) {
    let best = null, bestScore = Infinity;
    const eye = new THREE.Vector3(threat.x, threat.y + 1.4, threat.z), pt = new THREE.Vector3();
    let tests = 0;
    for (const c of this.colliders) {
      if (!COVER.has(c.type)) continue;
      const cd = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (cd > maxD + 3) continue;
      let dx = c.x - threat.x, dz = c.z - threat.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      let ext;
      if (c.t === 'c') ext = c.r;
      else {
        const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
        ext = Math.abs(dx * cos - dz * sin) * c.hw + Math.abs(dx * sin + dz * cos) * c.hd;
      }
      const x = c.x + dx * (ext + 0.65), z = c.z + dz * (ext + 0.65);
      const d = Math.hypot(x - pos.x, z - pos.z);
      if (d > maxD || d + 1 >= bestScore || this.isWater(x, z, 0.1) || this.blocked(x, z, 0.3)) continue;
      if (++tests > 8) break;
      pt.set(x, this.height(x, z) + 0.85, z);
      if (this.lineOfSight(eye, pt)) continue;
      best = { x, z };
      bestScore = d + 1;
    }
    return best;
  }

  blocked(x, z, margin) {
    for (const c of this.colliders) if (this.circleOverlap(c, x, z, margin)) return true;
    return false;
  }

  scatter(type, n, area, opts = {}) {
    const avoid = opts.avoid || [];
    const S = this.size;
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const x = area.x0 + this.rng() * (area.x1 - area.x0);
      const z = area.z0 + this.rng() * (area.z1 - area.z0);
      if (opts.ring && Math.abs(x) < S + 4 && Math.abs(z) < S + 4) continue;
      if (this.isWater(x, z, -0.3)) continue;
      if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
      if (type !== 'bush' && type !== 'fern' && this.blocked(x, z, 2.5)) continue;
      this.addProp(type, x, z, this.rng() * Math.PI * 2, 0.8 + this.rng() * 0.45);
      i++;
    }
  }

  addTower(x, z, rot, tag) {
    this.addProp('watchtower', x, z, rot);
    const y = this.height(x, z);
    this.towers.push({ x, y, z, tag });
    this.spawns.push({ team: 'ltte', x, z, tag, sentry: true });
  }

  addAlarm(x, z, rot, tag) {
    this.addProp('alarm', x, z, rot);
    this.alarms.push({ x, y: this.height(x, z), z, tag, disabled: false, triggered: false, runner: null });
  }

  // is a point hidden in vegetation? (bushes and ferns give concealment, not cover)
  inBush(x, z) {
    for (const b of this.placements.bush || []) {
      if (Math.abs(b.x - x) < 1.6 && Math.abs(b.z - z) < 1.6 && Math.hypot(b.x - x, b.z - z) < 1.3 * b.scale + 0.4) return true;
    }
    for (const b of this.placements.fern || []) {
      if (Math.abs(b.x - x) < 1.4 && Math.abs(b.z - z) < 1.4 && Math.hypot(b.x - x, b.z - z) < 1.1 * b.scale) return true;
    }
    return false;
  }

  // Set dressing from the mission's atmosphere: ferns and fallen logs under
  // the trees, a second tree species filling the forest, banana plants and
  // cadjan huts beside houses. Keeps clear of the start and the objectives.
  dress() {
    const D = this.atm.dress, rng = () => this.rng();
    const keep = [[this.mission.player.x, this.mission.player.z, 9], ...this.objectivePoints().map(([x, z]) => [x, z, 4])];
    const free = (x, z, m) => !this.isWater(x, z, -0.3) && Math.abs(x) < this.size + 40 && Math.abs(z) < this.size + 40
      && !keep.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r) && !this.blocked(x, z, m);
    const near = (type, n, around, r0, r1, margin) => {
      const base = around.flatMap((t) => this.placements[t] || []);
      if (!base.length) return;
      for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
        const b = base[Math.floor(rng() * base.length)];
        const a = rng() * Math.PI * 2, r = r0 + rng() * (r1 - r0);
        const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
        if (!free(x, z, margin)) continue;
        this.addProp(type, x, z, rng() * Math.PI * 2, 0.75 + rng() * 0.5);
        i++;
      }
    };
    const houses = [...(this.placements.house || []), ...(this.placements.house_ruined || [])];
    for (const h of houses) {
      if (rng() > 0.4) continue;
      const a = rng() * Math.PI * 2, x = h.x + Math.cos(a) * 10, z = h.z + Math.sin(a) * 10;
      if (free(x, z, 3)) this.addProp('hut', x, z, rng() * Math.PI * 2, 1);
    }
    near('tree_rain2', D.tree2, ['tree_jungle'], 5, 12, 2.5);
    near('fern', D.fern, ['tree_jungle', 'tree_rain2', 'palm_coconut'], 1.2, 5, 0.6);
    near('fallen_log', D.log, ['tree_jungle', 'tree_rain2', 'palm_coconut', 'palm_palmyrah'], 3, 8, 3.2);
    near('banana', D.banana, ['house', 'house_ruined', 'hut'], 4, 9, 1.5);
  }

  addSpawns(team, n, x, z, spread, tag, opts = {}) {
    for (let i = 0; i < n; i++) {
      let px = x, pz = z;
      for (let k = 0; k < 40; k++) {
        px = x + (this.rng() - 0.5) * spread * 2;
        pz = z + (this.rng() - 0.5) * spread * 2;
        if (!this.isWater(px, pz, 0.2) && !this.blocked(px, pz, 0.8)) break;
      }
      // about half of each cadre group patrols, the rest guard their posts
      this.spawns.push({ team, x: px, z: pz, tag, patrol: team === 'ltte' && opts.patrol !== false && i % 2 === 0 });
    }
  }

  addTarget(tag, x, z, opts) {
    const y = this.height(x, z);
    const t = { tag, x, y, z, label: opts.label || tag, time: opts.time || 2, plant: !!opts.plant, done: false, obj: null, blast: opts.blast, doneText: opts.doneText };
    if (opts.model) {
      const obj = models[opts.model].clone(true);
      obj.position.set(x, Math.max(y, this.water ?? y) - 0.2, z);
      obj.rotation.y = opts.rot || 0;
      this.group.add(obj);
      t.obj = obj;
      this.addColliders(opts.model, x, y, z, opts.rot || 0, 1, t);
    }
    this.targets.push(t);
  }

  buildInstances() {
    for (const [type, list] of Object.entries(this.placements)) {
      for (const part of meshParts(type)) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        im.castShadow = type !== 'bush' && type !== 'fern';
        im.receiveShadow = true;
        list.forEach((p, i) => {
          tmpQ.setFromAxisAngle(UP, p.rot);
          tmpS.setScalar(p.scale);
          tmpP.set(p.x, p.y, p.z);
          tmpM.compose(tmpP, tmpQ, tmpS).multiply(part.matrix);
          im.setMatrixAt(i, tmpM);
        });
        im.computeBoundingSphere();
        this.group.add(im);
      }
    }
  }

  // Wind-blown grass cards in tiles, so distant tiles can be culled.
  buildGrass() {
    const q = this.quality, total = GRASS_COUNT[q] || GRASS_COUNT.high;
    this.grassRange = q === 'low' ? 60 : q === 'medium' ? 85 : 110;
    this.grassTiles = [];
    const geo = new THREE.BufferGeometry();
    const P = [], U = [], Nn = [], I = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, cx = Math.cos(a) * 0.6, cz = Math.sin(a) * 0.6, b = P.length / 3;
      P.push(-cx, 0, -cz, cx, 0, cz, cx, 0.6, cz, -cx, 0.6, -cz);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      Nn.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    geo.setIndex(I);
    this.group.userData.grassGeo = geo;
    const mk = (tex) => makeFoliage(new THREE.MeshStandardMaterial({ map: tex, color: '#ffffff' }), 0.35, 0.02);
    const mats = [mk(textures.grass_card), mk(textures.grass_card_dry)];
    const span = (this.size + 20) * 2, tile = span / TILES;
    const buckets = Array.from({ length: TILES * TILES * 2 }, () => []);
    const dryShare = Math.min(0.9, this.atm.dryness * 0.9);
    for (let i = 0, n = 0; i < total * 4 && n < total; i++) {
      const x = (this.rng() - 0.5) * span, z = (this.rng() - 0.5) * span;
      if (this.isWater(x, z, -0.4)) continue;
      // grass clumps together and thins out on tracks, sand and mud
      const bare = Math.max(this.splatAt(x, z, 0) * 1.3, this.splatAt(x, z, 1), this.splatAt(x, z, 2) * 1.5);
      if (this.rng() < bare || fbm(x * 0.08, z * 0.08) < 0.38 + this.rng() * 0.15) continue;
      if (this.blocked(x, z, 0.3)) continue;
      const tx = Math.min(TILES - 1, Math.floor((x / span + 0.5) * TILES)), tz = Math.min(TILES - 1, Math.floor((z / span + 0.5) * TILES));
      const dry = this.rng() < dryShare ? 1 : 0;
      buckets[(tz * TILES + tx) * 2 + dry].push(x, z);
      n++;
    }
    const col = new THREE.Color(), tint = new THREE.Color(this.cfg.ground[1]).lerp(new THREE.Color('#ffffff'), 0.7);
    buckets.forEach((list, bi) => {
      if (!list.length) return;
      const count = list.length / 2;
      const im = new THREE.InstancedMesh(geo, mats[bi % 2], count);
      for (let k = 0; k < count; k++) {
        const x = list[k * 2], z = list[k * 2 + 1];
        tmpQ.setFromAxisAngle(UP, this.rng() * 6.28);
        const s = 0.6 + this.rng() * 0.6;
        tmpS.set(s, s * (0.6 + this.rng() * 0.6), s);
        tmpP.set(x, this.height(x, z) - 0.04, z);
        im.setMatrixAt(k, tmpM.compose(tmpP, tmpQ, tmpS));
        im.setColorAt(k, col.copy(tint).multiplyScalar(0.8 + this.rng() * 0.4));
      }
      const t = Math.floor(bi / 2);
      im.userData.cx = ((t % TILES) + 0.5) * tile - span / 2;
      im.userData.cz = (Math.floor(t / TILES) + 0.5) * tile - span / 2;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.grassTiles.push(im);
    });
    this.grassRange += tile * 0.7;
  }

  // fallen leaves and twigs on the forest floor, tilted to the slope
  buildLitter() {
    const trees = [...(this.placements.tree_jungle || []), ...(this.placements.tree_rain2 || [])];
    const n = Math.round(this.atm.litter * (this.quality === 'low' ? 500 : 1400));
    if (!trees.length || !n) return;
    const geo = new THREE.PlaneGeometry(2.4, 2.4);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: textures.leaf_litter, alphaTest: 0.5, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const im = new THREE.InstancedMesh(geo, mat, n);
    const nrm = new THREE.Vector3(), q2 = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const t = trees[Math.floor(this.rng() * trees.length)];
      const a = this.rng() * 6.28, r = this.rng() * 6;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const h = this.height(x, z);
      nrm.set(this.height(x - 0.5, z) - this.height(x + 0.5, z), 1, this.height(x, z - 0.5) - this.height(x, z + 0.5)).normalize();
      q2.setFromUnitVectors(UP, nrm);
      tmpQ.setFromAxisAngle(UP, this.rng() * 6.28).premultiply(q2);
      tmpS.setScalar(0.7 + this.rng() * 0.8);
      tmpP.set(x, h + 0.02, z);
      im.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    im.receiveShadow = true;
    im.userData.ownGeometry = true;
    im.computeBoundingSphere();
    this.group.add(im);
  }

  // Distant hills and tree lines beyond the play area, layered by the fog.
  buildHills() {
    const R0 = this.terrainSize / 2 - 6, R1 = 470, rings = 10, segs = 160;
    const P = [], C = [], I = [];
    const near = new THREE.Color(this.cfg.ground[0]).multiplyScalar(0.55), far = new THREE.Color(this.atm.fog[0]).lerp(near, 0.35);
    const c = new THREE.Color(), flat = this.cfg.flatHorizon;
    for (let r = 0; r <= rings; r++) {
      const k = r / rings, rad = R0 + (R1 - R0) * Math.pow(k, 1.3);
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        const ex = Math.cos(a) * R0, ez = Math.sin(a) * R0;
        const edge = this.height(ex, ez);
        const sea = this.water !== null && edge < this.water + 0.3;
        let h = edge;
        if (sea) h = this.water - 3;
        else {
          const ridge = fbm(a * 4 + 3, k * 2) * (flat ? 6 : 34) + fbm(a * 23, k * 9 + 5) * (flat ? 3 : 7);
          h = edge + Math.pow(k, 0.8) * ridge + (r > 0 ? fbm(a * 60, r) * 2.5 : 0);
        }
        P.push(x, h, z);
        c.copy(near).lerp(far, k).multiplyScalar(0.85 + fbm(a * 40, k * 6) * 0.3);
        C.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s, b = a + segs + 1;
        I.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    mesh.userData.ownGeometry = true;
    this.group.add(mesh);
  }

  // soft contact shadows that ground every soldier and civilian
  buildBlobs() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: radialTexture(), color: '#000000', transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.blobs = new THREE.InstancedMesh(geo, mat, 96);
    this.blobs.frustumCulled = false;
    this.blobs.userData.ownGeometry = true;
    this.blobs.renderOrder = 1;
    this.group.add(this.blobs);
  }

  updateBlobs() {
    let n = 0;
    for (const u of this.units) {
      if (n >= 96 || !u.obj?.visible) continue;
      const lying = !u.alive || u.stance === 'prone';
      tmpQ.setFromAxisAngle(UP, u.yaw || 0);
      tmpS.set(lying ? 1.1 : 1.0, 1, lying ? 2.2 : 1.0);
      tmpP.set(u.pos.x, u.pos.y + 0.03, u.pos.z);
      this.blobs.setMatrixAt(n++, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- collision

  circleOverlap(c, x, z, r) {
    if (c.t === 'c') return Math.hypot(x - c.x, z - c.z) < c.r + r;
    const dx = x - c.x, dz = z - c.z;
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    return Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r;
  }

  // Push a circle (x, z, radius) at height y out of all colliders. Mutates pos.
  resolve(pos, radius) {
    for (const c of this.colliders) {
      if (c.y1 < pos.y + 0.45 || c.y0 > pos.y + 1.6) continue;
      if (c.t === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + radius;
        if (d < min && d > 1e-4) {
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
        let lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        const ox = c.hw + radius - Math.abs(lx), oz = c.hd + radius - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) lx += Math.sign(lx || 1) * ox;
          else lz += Math.sign(lz || 1) * oz;
          pos.x = c.x + lx * cos + lz * sin;
          pos.z = c.z - lx * sin + lz * cos;
        }
      }
    }
    const lim = this.size - 2;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }

  // Ray test against terrain, water, props, targets and units.
  // Returns { t, point, kind: 'terrain'|'water'|'prop'|'unit', unit, head, target } or null.
  raycast(o, d, maxT = 300, ignore = null, withUnits = true) {
    let best = { t: maxT, kind: null };

    for (const c of this.colliders) {
      const t = c.t === 'c' ? rayCyl(o, d, c) : rayBox(o, d, c);
      if (t !== null && t < best.t) best = { t, kind: c.ref ? 'target' : 'prop', target: c.ref };
    }

    if (withUnits) {
      for (const u of this.units) {
        if (!u.alive || u === ignore) continue;
        const p = u.pos, bh = u.bodyHeight;
        const th = raySphere(o, d, p.x, p.y + bh + 0.14, p.z, 0.15);
        if (th !== null && th < best.t) best = { t: th, kind: 'unit', unit: u, head: true };
        const tb = rayCyl(o, d, { x: p.x, z: p.z, r: 0.3, y0: p.y, y1: p.y + bh });
        if (tb !== null && tb < best.t) best = { t: tb, kind: 'unit', unit: u, head: false };
      }
    }

    // march the terrain / water surface
    const step = 1.0;
    let prev = 0;
    for (let t = step; t <= best.t + step; t += step) {
      const tt = Math.min(t, best.t);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      const ground = this.height(x, z);
      const surf = this.water !== null ? Math.max(ground, this.water) : ground;
      if (y < surf) {
        let lo = prev, hi = tt;
        for (let i = 0; i < 8; i++) {
          const m = (lo + hi) / 2;
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          const g = this.height(mx, mz);
          const s = this.water !== null ? Math.max(g, this.water) : g;
          if (my < s) hi = m; else lo = m;
        }
        const hx = o.x + d.x * hi, hz = o.z + d.z * hi;
        const kind = this.water !== null && this.height(hx, hz) < this.water ? 'water' : 'terrain';
        best = { t: hi, kind };
        break;
      }
      prev = tt;
      if (tt >= best.t) break;
    }

    if (!best.kind) return null;
    best.point = new THREE.Vector3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
    return best;
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    d.divideScalar(len);
    const hit = this.raycast(a, d, len, null, false);
    return !hit || hit.t > len - 0.3;
  }
}

// ---------------------------------------------------------------- ray helpers

function rayCyl(o, d, c) {
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  let t = null;
  if (a > 1e-8) {
    const b = 2 * (ox * d.x + oz * d.z);
    const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t0 = (-b - s) / (2 * a);
      const t1 = (-b + s) / (2 * a);
      for (const tc of [t0, t1]) {
        if (tc > 0.01) {
          const y = o.y + d.y * tc;
          if (y >= c.y0 && y <= c.y1) { t = tc; break; }
        }
      }
    }
  }
  if (d.y < 0) {
    const tt = (c.y1 - o.y) / d.y;
    if (tt > 0.01 && (t === null || tt < t)) {
      const x = ox + d.x * tt, z = oz + d.z * tt;
      if (x * x + z * z <= c.r * c.r) t = tt;
    }
  }
  return t;
}

function rayBox(o, d, c) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  const dx = o.x - c.x, dz = o.z - c.z;
  const lo = [dx * cos - dz * sin, o.y, dx * sin + dz * cos];
  const ld = [d.x * cos - d.z * sin, d.y, d.x * sin + d.z * cos];
  const mn = [-c.hw, c.y0, -c.hd], mx = [c.hw, c.y1, c.hd];
  let tmin = 0.01, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-9) {
      if (lo[i] < mn[i] || lo[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - lo[i]) / ld[i], t2 = (mx[i] - lo[i]) / ld[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0.01 ? t : null;
}
