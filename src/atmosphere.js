// Per-mission look: sun, sky, fog, weather, colour grade and set dressing.
// Fog distances are kept long enough that enemies within normal engagement
// range (about 150 m) stay visible — the haze adds depth, not unfair cover.

const BASE = {
  sunElev: 42, sunAzim: 210, sunColor: '#fff0d6', sunIntensity: 2.8,
  hemiSky: '#bcd4e6', hemiGround: '#5a5235', hemiIntensity: 0.55, envIntensity: 0.55,
  skyTop: '#5f8fbf', horizon: '#c9d8de', clouds: 0.35, cloudColor: '#ffffff',
  fog: ['#c3d2d6', 30, 260], exposure: 1.0,
  grade: { sat: 1.05, contrast: 1.06, tint: [1, 1, 1], vignette: 0.32, grain: 0.035 },
  weather: { rain: 0, mist: 0, dust: 0, lightning: false, smoke: 0, wind: 1 },
  dryness: 0.25, litter: 0.3, wet: 0,
  dress: { fern: 60, banana: 0, log: 6, tree2: 30 },
};

const merge = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...a[k], ...v } : v;
  return o;
};

export const ATMOSPHERE = {
  // Humid morning over the paddies and the sluice canal, August 2006.
  mavilaru: merge(BASE, {
    sunElev: 32, sunAzim: 115, sunColor: '#ffe6c2', sunIntensity: 2.7,
    skyTop: '#5d8cb8', horizon: '#d6dfdc', clouds: 0.4,
    fog: ['#cdd8d4', 35, 250], dryness: 0.1, litter: 0.15,
    weather: { mist: 0.35 },
    grade: { sat: 1.06, tint: [1.02, 1.0, 0.97] },
    dress: { fern: 40, banana: 26, log: 4, tree2: 25 },
  }),
  // Hot afternoon over the scrub and palmyrah south of Koddiyar Bay.
  sampur: merge(BASE, {
    sunElev: 38, sunAzim: 250, sunColor: '#ffe2b8', sunIntensity: 3.0,
    skyTop: '#6593c2', horizon: '#e2dccb', clouds: 0.25,
    fog: ['#d6d2c2', 40, 250], dryness: 0.6, litter: 0.05,
    weather: { dust: 0.6, wind: 1.3 },
    grade: { sat: 1.0, contrast: 1.06, tint: [1.05, 1.0, 0.93] },
    dress: { fern: 0, banana: 10, log: 3, tree2: 0 },
  }),
  // Early morning mist on the Vakarai lagoon.
  vakarai: merge(BASE, {
    sunElev: 16, sunAzim: 95, sunColor: '#ffd2a0', sunIntensity: 2.4,
    skyTop: '#62849f', horizon: '#e4d7c2', clouds: 0.35, cloudColor: '#ffe2c8',
    fog: ['#c8cdc4', 25, 200], exposure: 1.05,
    weather: { mist: 0.8 }, dryness: 0.05, litter: 0.6,
    grade: { sat: 1.02, contrast: 1.06, tint: [1.03, 1.0, 0.96] },
    dress: { fern: 120, banana: 30, log: 10, tree2: 0 },
  }),
  // Dawn in the Thoppigala jungle: low warm sun through ground mist.
  thoppigala: merge(BASE, {
    sunElev: 12, sunAzim: 80, sunColor: '#ffc58f', sunIntensity: 2.4,
    hemiSky: '#a7b9c4', hemiIntensity: 0.5,
    skyTop: '#59789a', horizon: '#e8cfae', clouds: 0.3, cloudColor: '#ffd9b8',
    fog: ['#b9c0b2', 22, 190], exposure: 1.05,
    weather: { mist: 1 }, dryness: 0.05, litter: 1,
    grade: { sat: 1.0, contrast: 1.08, tint: [1.05, 1.0, 0.94], vignette: 0.38 },
    dress: { fern: 220, banana: 0, log: 26, tree2: 90 },
  }),
  // Dusk on the Pooneryn coast: sun low over the sea in the west.
  pooneryn: merge(BASE, {
    sunElev: 9, sunAzim: 275, sunColor: '#ffb070', sunIntensity: 2.6,
    hemiSky: '#9fb0c8', hemiGround: '#6a5a40', hemiIntensity: 0.5,
    skyTop: '#4a6a94', horizon: '#f0c08a', clouds: 0.45, cloudColor: '#ffc6a0',
    fog: ['#d1b9a0', 40, 260], exposure: 1.08,
    dryness: 0.55, litter: 0.05,
    weather: { dust: 0.3, wind: 1.4 },
    grade: { sat: 1.08, contrast: 1.1, tint: [1.08, 0.98, 0.9] },
    dress: { fern: 10, banana: 6, log: 2, tree2: 0 },
  }),
  // North-east monsoon over Kilinochchi: overcast, rain, mud and lightning.
  kilinochchi: merge(BASE, {
    sunElev: 50, sunAzim: 160, sunColor: '#c9d2dc', sunIntensity: 1.1,
    hemiSky: '#9aa6b0', hemiGround: '#4a4a3a', hemiIntensity: 0.85, envIntensity: 0.7,
    skyTop: '#5b636c', horizon: '#9ba3a6', clouds: 1, cloudColor: '#8a9198',
    fog: ['#8f989a', 18, 175], exposure: 1.1,
    weather: { rain: 1, mist: 0.5, lightning: true, wind: 1.8, smoke: 2 },
    dryness: 0, litter: 0.3, wet: 1,
    grade: { sat: 0.82, contrast: 1.08, tint: [0.96, 1.0, 1.04], vignette: 0.4 },
    dress: { fern: 50, banana: 20, log: 6, tree2: 20 },
  }),
  // Midday glare on the Elephant Pass isthmus: salt flats, heat haze, dust.
  elephantpass: merge(BASE, {
    sunElev: 68, sunAzim: 190, sunColor: '#fff4e0', sunIntensity: 3.1,
    skyTop: '#6a9ccc', horizon: '#e0e2da', clouds: 0.15,
    fog: ['#d8d8cc', 45, 280], exposure: 0.95,
    weather: { dust: 1, wind: 1.3 }, dryness: 0.85, litter: 0,
    grade: { sat: 0.95, contrast: 1.04, tint: [1.04, 1.01, 0.95] },
    dress: { fern: 0, banana: 0, log: 1, tree2: 0 },
  }),
  // Anandapuram: shelling smoke over the coconut groves.
  anandapuram: merge(BASE, {
    sunElev: 34, sunAzim: 200, sunColor: '#ffdcb4', sunIntensity: 2.2,
    hemiSky: '#b4b4ac', hemiIntensity: 0.6,
    skyTop: '#80888e', horizon: '#d2c8b6', clouds: 0.6, cloudColor: '#cec4b4',
    fog: ['#c4bcaa', 28, 210],
    weather: { dust: 0.6, smoke: 3 }, dryness: 0.5, litter: 0.05,
    grade: { sat: 0.85, contrast: 1.07, tint: [1.04, 1.0, 0.94], vignette: 0.38 },
    dress: { fern: 6, banana: 10, log: 4, tree2: 0 },
  }),
  // The night of the Puthumathalan breach: moonlight and sea mist.
  puthumathalan: merge(BASE, {
    sunElev: 35, sunAzim: 120, sunColor: '#9fb4d8', sunIntensity: 0.55,
    hemiSky: '#334466', hemiGround: '#1a1a14', hemiIntensity: 0.35, envIntensity: 0.25,
    skyTop: '#04060c', horizon: '#18202e', clouds: 0.35, cloudColor: '#2a3344',
    fog: ['#0d121c', 15, 150], exposure: 1.35,
    weather: { mist: 0.6, wind: 0.8 }, dryness: 0.35, litter: 0.05,
    grade: { sat: 0.7, contrast: 1.1, tint: [0.9, 0.97, 1.1], vignette: 0.45, grain: 0.05 },
    dress: { fern: 6, banana: 8, log: 3, tree2: 0 },
  }),
  // The last weeks at Nandikadal: smoke over the lagoon, muted light.
  nandikadal: merge(BASE, {
    sunElev: 30, sunAzim: 240, sunColor: '#ffd9b0', sunIntensity: 1.8,
    hemiSky: '#b0b0a8', hemiIntensity: 0.6,
    skyTop: '#7d8790', horizon: '#cdc4b4', clouds: 0.7, cloudColor: '#c8c0b4',
    fog: ['#c2bbad', 28, 210],
    weather: { dust: 0.5, smoke: 4 }, dryness: 0.4, litter: 0.1,
    grade: { sat: 0.8, contrast: 1.06, tint: [1.03, 1.0, 0.95], vignette: 0.4 },
    dress: { fern: 12, banana: 14, log: 3, tree2: 10 },
  }),
};

export function atmosphereFor(id) {
  return ATMOSPHERE[id] || BASE;
}
