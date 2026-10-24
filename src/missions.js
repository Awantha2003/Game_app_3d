// Campaign data. Every mission is built on a real operation of Eelam War IV
// (2006-2009). Dates, places and formations come from public sources listed in
// README.md. Gameplay is simplified; the history text is kept factual.

import { fbm } from './noise.js';

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const MISSIONS = [
  {
    id: 'mavilaru',
    name: 'Mavil Aru',
    si: 'මාවිල් ආරු',
    date: 'July – August 2006',
    place: 'Trincomalee District, Eastern Province',
    briefing: [
      'On 21 July 2006 the LTTE closed the sluice gates of the Mavil Aru anicut, cutting off irrigation water to thousands of farming families downstream.',
      'Talks brokered by the Sri Lanka Monitoring Mission failed. After air strikes on 26 July, ground troops moved in to reopen the gates. The gates were reopened in early August 2006 (sources give 8 or 10 August).',
      'The fighting at Mavil Aru is generally seen as the start of Eelam War IV.',
    ],
    debrief: 'With the water flowing again, the army pushed on through the East: Sampur fell in September 2006 and Vakarai in January 2007.',
    world: {
      size: 120,
      ground: ['#6f8f35', '#86a33e'], paddy: true,
      sky: '#9fc3dd', fog: ['#b9cfd9', 40, 230], water: -0.6,
      height: (x, z) => {
        const canal = Math.abs(x - 40) < 7 ? -2.2 * smooth(7, 4, Math.abs(x - 40)) : 0;
        const edge = smooth(70, 110, Math.abs(x)) * 6 + fbm(x * 0.03, z * 0.03) * 1.2;
        return canal + edge * (1 - smooth(10, 4, Math.abs(x - 40)));
      },
    },
    player: { x: 0, z: 100 },
    allies: 3,
    insertion: 'apc',
    layout(w) {
      w.tower(14, 36, 0, 'outpost');
      w.tower(-4, -60, 0.4, 'gate');
      w.alarm(10, -66, 0.2, 'gate');
      w.scatter('tree_jungle', 70, { x0: -118, x1: -70, z0: -118, z1: 118 });
      w.scatter('tree_jungle', 50, { x0: 60, x1: 118, z0: -118, z1: 118 });
      w.scatter('palm_coconut', 40, { x0: -70, x1: 30, z0: -118, z1: 118 }, { avoid: [[0, 100, 15], [0, 30, 14], [10, -40, 18]] });
      w.scatter('bush', 90, { x0: -110, x1: 110, z0: -118, z1: 118 });
      w.prop('buffel', 6, 108, 0.2);
      w.prop('supplies', -5, 106, 0);
      // forward LTTE outpost in the paddy fields
      w.prop('bunker', -8, 30, 0); w.prop('bunker', 12, 26, 0.6);
      w.prop('sandbag_wall', 2, 34, 0); w.prop('sandbag_wall', -18, 28, 0.4);
      w.enemies(6, 0, 28, 14, 'outpost');
      // defenders around the anicut
      w.prop('sluice_gate', 40, -50, 0);
      w.prop('bunker', 20, -40, 0); w.prop('bunker', 24, -62, 1);
      w.prop('sandbag_wall', 28, -48, Math.PI / 2); w.prop('sandbag_wall', 15, -55, 0.2);
      w.prop('house_ruined', 8, -70, 0.3);
      w.prop('supplies', 0, -10, 0.5);
      w.enemies(8, 18, -52, 14, 'gate');
      w.target('gate', 31, -50, { label: 'Sluice gate controls', time: 3, doneText: 'The sluice gates are open — water is flowing to the paddy fields again' });
    },
    objectives: [
      { type: 'clear', tag: 'outpost', text: 'Clear the LTTE outpost in the paddy fields' },
      { type: 'reach', pos: [20, -30], r: 12, text: 'Advance to the Mavil Aru anicut' },
      { type: 'clear', tag: 'gate', text: 'Secure the anicut', spawn: [{ x: 10, z: -90, n: 3, tag: 'gate' }] },
      { type: 'interact', tag: 'gate', text: 'Open the sluice gates' },
    ],
  },

  {
    id: 'sampur',
    name: 'Sampur',
    si: 'සාම්පූර්',
    date: 'August – September 2006',
    place: 'Trincomalee District, south of Koddiyar Bay',
    briefing: [
      'From Sampur, on the southern shore of Koddiyar Bay, LTTE artillery could reach Trincomalee harbour and the naval base across the water.',
      'In late August 2006, after LTTE attacks around Muttur, the army launched an operation to take the Sampur area.',
      'Troops entered Sampur on 4 September 2006. It was the first significant territory taken from the LTTE in Eelam War IV.',
    ],
    debrief: 'Sampur was captured on 4 September 2006, removing the artillery threat to Trincomalee harbour. The army next turned south towards Vakarai.',
    world: {
      size: 120,
      ground: ['#8a8a4a', '#9a9455'],
      sky: '#b0c8dc', fog: ['#cfd2c6', 40, 250], water: -0.4,
      height: (x, z) => {
        const shore = 58 + Math.sin(z * 0.04) * 8;
        return -2.5 + smooth(shore + 6, shore - 6, x) * (3 + fbm(x * 0.03, z * 0.03) * 2.2);
      },
    },
    player: { x: -30, z: 100 },
    allies: 3,
    insertion: 'apc',
    layout(w) {
      w.scatter('palm_palmyrah', 60, { x0: -118, x1: 50, z0: -118, z1: 118 }, { avoid: [[-30, 100, 14], [-5, 40, 16], [-2, -25, 22], [0, -80, 18]] });
      w.scatter('palm_coconut', 35, { x0: -60, x1: 55, z0: -118, z1: -40 }, { avoid: [[0, -80, 14]] });
      w.scatter('bush', 140, { x0: -118, x1: 50, z0: -118, z1: 118 }, { avoid: [[-30, 100, 8]] });
      w.scatter('rock_small', 14, { x0: -110, x1: 40, z0: -100, z1: 100 }, { avoid: [[-30, 100, 10]] });
      w.prop('buffel', -22, 110, 0.1); w.prop('supplies', -36, 104, 0);
      // forward bunker line
      w.prop('bunker', -14, 40, 0.2); w.prop('bunker', 8, 36, 1.4);
      w.prop('sandbag_wall', -4, 44, 0); w.prop('sandbag_wall', 18, 42, 0.3);
      w.tower(-26, 34, 0.3, 'line');
      w.enemies(7, -4, 36, 16, 'line');
      // the gun line that shelled the harbour
      w.prop('supplies', -18, 8, 0.4);
      w.prop('sandbag_wall', -10, -14, 0.1); w.prop('bunker', 14, -16, 2.0);
      w.alarm(0, -8, 0.4, 'guns');
      w.enemies(7, -2, -24, 14, 'guns');
      w.target('guns', -14, -26, { model: 'artillery', rot: Math.PI + 0.3, label: 'Field gun', time: 3, plant: true });
      w.target('guns', 12, -30, { model: 'artillery', rot: Math.PI - 0.2, label: 'Field gun', time: 3, plant: true });
      // Sampur village
      for (const [x, z, r] of [[-14, -74, 0.2], [8, -78, 1.4], [-4, -92, 2.6], [18, -94, 0.6]]) w.prop('hut', x, z, r);
      w.prop('house_ruined', -24, -88, 1.1); w.prop('sandbag_wall', 2, -66, 0);
      w.enemies(6, 0, -84, 14, 'village');
    },
    objectives: [
      { type: 'clear', tag: 'line', text: 'Break through the forward bunker line' },
      { type: 'clear', tag: 'guns', text: 'Clear the gun line' },
      { type: 'interact', tag: 'guns', text: 'Plant charges on the field guns' },
      { type: 'clear', tag: 'village', text: 'Secure Sampur', spawn: [{ x: 10, z: -110, n: 3, tag: 'village' }] },
    ],
  },

  {
    id: 'vakarai',
    name: 'Vakarai',
    si: 'වාකරේ',
    date: 'January 2007',
    place: 'Batticaloa District, Eastern Province',
    briefing: [
      'Vakarai, a coastal town north of Batticaloa between the lagoon and the sea, was the main LTTE-held area left in the East at the end of 2006.',
      'As the army closed in, tens of thousands of civilians left the area for government-held territory, many of them crossing the lagoon.',
      'Troops took Vakarai on 19 January 2007.',
    ],
    debrief: 'Vakarai was captured on 19 January 2007. The remaining LTTE fighters in the East withdrew into the jungles around Thoppigala.',
    world: {
      size: 120,
      ground: ['#5f7d2e', '#738f38'],
      sky: '#a9c4d4', fog: ['#b8c8c4', 30, 220], water: -0.4,
      height: (x, z) => {
        const lagoon = -45 + Math.sin(z * 0.05) * 8;
        return -2.5 + smooth(lagoon - 6, lagoon + 6, x) * (3 + fbm(x * 0.04, z * 0.04) * 1.2);
      },
    },
    player: { x: -32, z: 96 },
    allies: 4,
    insertion: 'boat',
    layout(w) {
      w.scatter('tree_rain2', 70, { x0: -60, x1: 118, z0: -118, z1: 118 }, { avoid: [[-32, 96, 14], [0, 45, 14], [6, -6, 22], [18, -82, 16]] });
      w.scatter('palm_coconut', 60, { x0: -50, x1: 118, z0: -118, z1: 118 }, { avoid: [[-32, 96, 12], [6, -6, 18], [18, -82, 14]] });
      w.scatter('bush', 150, { x0: -55, x1: 118, z0: -118, z1: 118 }, { avoid: [[-32, 96, 8]] });
      w.prop('supplies', -24, 100, 0.3);
      // fighters on the lagoon shore
      w.prop('bunker', -8, 44, 0.4); w.prop('sandbag_wall', 6, 48, 0.2); w.prop('fallen_log', -18, 52, 0.9);
      w.enemies(6, 0, 42, 14, 'shore');
      // the village where families are sheltering
      for (const [x, z, r] of [[-6, -2, 0.3], [14, 4, 1.2], [20, -14, 2.2], [-2, -18, 0.8]]) w.prop('hut', x, z, r);
      w.prop('house_ruined', 30, 0, 1.6);
      w.civilians(10, 6, -8, 5);
      w.enemies(6, 6, -28, 14, 'village');
      w.prop('supplies', -14, 12, 1);
      // the last position south of the town
      w.prop('bunker', 10, -82, 0.1); w.prop('bunker', 28, -86, 1.9); w.prop('sandbag_wall', 18, -74, 0);
      w.tower(36, -70, 0.4, 'last');
      w.enemies(6, 18, -84, 14, 'last');
    },
    objectives: [
      { type: 'clear', tag: 'shore', text: 'Clear the fighters on the lagoon shore' },
      { type: 'clear', tag: 'village', text: 'Clear the fighters around the village' },
      { type: 'escort', zone: [-30, 92, 12], text: 'Lead the families to the boats', reach: [6, -8] },
      { type: 'clear', tag: 'last', text: 'Clear the last position south of Vakarai' },
    ],
  },

  {
    id: 'thoppigala',
    name: 'Thoppigala',
    si: 'තොප්පිගල',
    date: 'July 2007',
    place: 'Batticaloa District, Eastern Province',
    briefing: [
      'After Mavil Aru, Sampur and Vakarai, the LTTE\'s last stronghold in the East was the jungle around Thoppigala — a granite massif the British called "Baron\'s Cap".',
      'Army Special Forces and Commandos fought through thick jungle to reach it. Thoppigala was captured on 11 July 2007.',
      'With it, the Eastern Province was cleared and the war turned north to the Wanni.',
    ],
    debrief: 'The capture of Thoppigala ended LTTE military control in the East. The army now prepared for the much larger Northern campaign.',
    world: {
      size: 120,
      ground: ['#4f6b28', '#62802f'],
      sky: '#a9c4d4', fog: ['#9fb6a8', 25, 170], water: null,
      height: (x, z) => fbm(x * 0.02, z * 0.02) * 9 + smooth(60, 10, Math.hypot(x, z + 75)) * 4,
    },
    player: { x: -10, z: 105 },
    allies: 3,
    insertion: 'heli',
    layout(w) {
      w.tower(14, 30, 0.2, 'camp1');
      w.tower(-6, -30, 1.1, 'camp2');
      w.alarm(-26, -12, 0.5, 'camp2');
      w.prop('rock_outcrop', 0, -78, 0, 1.3);
      w.prop('rock_small', 25, -40, 0, 2); w.prop('rock_small', -30, 10, 1, 1.6);
      w.scatter('tree_jungle', 240, { x0: -118, x1: 118, z0: -118, z1: 118 },
        { avoid: [[-10, 105, 12], [0, 40, 16], [-20, -20, 16], [0, -78, 28]] });
      w.scatter('bush', 220, { x0: -118, x1: 118, z0: -118, z1: 118 }, { avoid: [[-10, 105, 8], [0, -78, 22]] });
      w.scatter('rock_small', 30, { x0: -110, x1: 110, z0: -110, z1: 110 }, { avoid: [[0, -78, 25]] });
      w.prop('supplies', -4, 100, 0);
      // jungle camps
      w.prop('bunker', 4, 38, 0.3); w.prop('sandbag_wall', -6, 44, 0.1); w.prop('supplies', 2, 46, 1);
      w.enemies(7, 0, 40, 14, 'camp1');
      w.prop('bunker', -20, -18, 1); w.prop('sandbag_wall', -10, -14, 0.5); w.prop('house_ruined', -28, -26, 1.2);
      w.enemies(7, -18, -20, 14, 'camp2');
      w.prop('bunker', 18, -55, 0.2); w.prop('bunker', -18, -58, 2.2);
      w.enemies(6, 0, -55, 16, 'peak');
    },
    objectives: [
      { type: 'clear', tag: 'camp1', text: 'Destroy the first jungle camp' },
      { type: 'alarm', tag: 'camp2', text: 'Sabotage the alarm at the second camp' },
      { type: 'clear', tag: 'camp2', text: 'Clear the second camp' },
      { type: 'reach', pos: [0, -48], r: 10, text: 'Reach the foot of Baron\'s Cap' },
      { type: 'clear', tag: 'peak', text: 'Eliminate the last defenders of Thoppigala', spawn: [{ x: 30, z: -90, n: 3, tag: 'peak' }] },
    ],
  },

  {
    id: 'pooneryn',
    name: 'Pooneryn',
    si: 'පූනරින්',
    date: 'November 2008',
    place: 'North-west coast, Kilinochchi District',
    briefing: [
      'Through 2008, Task Force 1 (later the 58 Division) advanced up the north-west coast from Mannar: Adampan in May, Vidattaltivu in July.',
      'In October the troops seized Nachchikuda, once a major Sea Tiger base, and pushed along the A-32 road towards Pooneryn.',
      'At dawn on 15 November 2008, soldiers of the 12th Gemunu Watch and 10th Gajaba Regiment entered Pooneryn — the last LTTE stronghold on the western coast.',
    ],
    debrief: 'Pooneryn fell on 15 November 2008. With the west coast secured, the army turned east towards Kilinochchi.',
    world: {
      size: 120,
      ground: ['#9a9a5a', '#7c8a3e'],
      sky: '#a6c9e0', fog: ['#c2d4dc', 50, 240], water: -0.4,
      height: (x, z) => {
        const coast = -45 + Math.sin(z * 0.03) * 8;
        const land = smooth(coast - 8, coast + 6, x);
        return -3 + land * (3.2 + fbm(x * 0.03, z * 0.03) * 1.5);
      },
    },
    player: { x: -33, z: 100 },
    allies: 3,
    insertion: 'boat',
    layout(w) {
      w.tower(-14, 8, 0.3, 'base');
      w.alarm(-20, 34, 1.2, 'base');
      w.scatter('palm_palmyrah', 70, { x0: -30, x1: 118, z0: -118, z1: 118 }, { avoid: [[10, 105, 12], [-33, 100, 10], [-35, 20, 18], [10, -80, 25]] });
      w.scatter('palm_coconut', 45, { x0: -40, x1: 60, z0: -118, z1: 118 }, { avoid: [[10, 105, 12], [-35, 20, 18], [10, -80, 25]] });
      w.scatter('bush', 120, { x0: -35, x1: 118, z0: -118, z1: 118 }, { avoid: [[10, 105, 8]] });
      w.prop('buffel', 18, 112, -0.2); w.prop('supplies', -26, 106, 0);
      // Sea Tiger boat yard at Nachchikuda
      w.target('boat', -44, 10, { model: 'seatiger_boat', rot: 1.4, label: 'Sea Tiger boat', time: 2.5, plant: true });
      w.target('boat', -43, 22, { model: 'seatiger_boat', rot: 1.7, label: 'Sea Tiger boat', time: 2.5, plant: true });
      w.target('boat', -44.5, 34, { model: 'seatiger_boat', rot: 1.5, label: 'Sea Tiger boat', time: 2.5, plant: true });
      w.prop('house_ruined', -25, 18, 0.2); w.prop('bunker', -30, 40, 0); w.prop('bunker', -28, 2, 1);
      w.prop('supplies', -22, 30, 0.4); w.prop('sandbag_wall', -18, 22, Math.PI / 2);
      w.enemies(9, -32, 22, 14, 'base');
      // Pooneryn town
      for (const [x, z, r] of [[0, -70, 0], [18, -74, 0.2], [-14, -86, 1.6], [8, -95, 3.1], [26, -92, 1.5], [-6, -60, 0.1]]) {
        w.prop(w.rng() < 0.5 ? 'house' : 'house_ruined', x, z, r);
      }
      w.prop('sandbag_wall', 10, -58, 0); w.prop('bunker', -20, -66, 0.4);
      w.enemies(9, 6, -78, 18, 'town');
    },
    objectives: [
      { type: 'clear', tag: 'base', text: 'Assault the Sea Tiger base at Nachchikuda' },
      { type: 'interact', tag: 'boat', text: 'Plant charges on the Sea Tiger boats' },
      { type: 'reach', pos: [8, -50], r: 12, text: 'Advance up the A-32 to Pooneryn' },
      { type: 'clear', tag: 'town', text: 'Secure Pooneryn town' },
    ],
  },

  {
    id: 'kilinochchi',
    name: 'Kilinochchi',
    si: 'කිලිනොච්චිය',
    date: 'November 2008 – January 2009',
    place: 'Kilinochchi District, Wanni',
    briefing: [
      'Kilinochchi was the administrative centre of the LTTE. To protect it, the Tigers built a long arc of ditches and earth bunds across the approaches.',
      'The 57 Division attacked from the south and west while Task Force 1 swung up from Pooneryn to converge from the north. The fighting lasted from November 2008 into the new year.',
      'Troops entered Kilinochchi town on 2 January 2009. Before withdrawing, the LTTE blew up the town\'s water tower — its toppled remains still stand as a memorial.',
    ],
    debrief: 'Kilinochchi fell on 2 January 2009 after one of the longest battles of the war. The LTTE fell back towards Mullaitivu.',
    world: {
      size: 120,
      ground: ['#8a7a45', '#6f7a35'],
      sky: '#b2c4cc', fog: ['#b8b8a8', 30, 200], water: null,
      height: (x, z) => fbm(x * 0.025, z * 0.025) * 2.5 - smooth(4, 0, Math.abs(z - 34)) * 1.4,
    },
    player: { x: 0, z: 105 },
    allies: 4,
    shelling: true,
    insertion: 'apc',
    layout(w) {
      w.tower(22, -10, 0.2, 'town');
      // the ditch-cum-earth-bund line with one breach point at x = 0
      for (let x = -110; x <= 110; x += 20) {
        if (Math.abs(x) < 12) continue;
        w.prop('earth_bund', x, 28, 0);
      }
      w.scatter('palm_palmyrah', 50, { x0: -118, x1: 118, z0: 50, z1: 118 }, { avoid: [[0, 105, 14]] });
      w.scatter('palm_coconut', 50, { x0: -118, x1: 118, z0: -118, z1: 20 }, { avoid: [[0, -40, 40]] });
      w.scatter('bush', 120, { x0: -118, x1: 118, z0: -118, z1: 118 }, { avoid: [[0, 105, 8]] });
      w.prop('buffel', -10, 110, 0.1); w.prop('buffel', 12, 112, -0.1); w.prop('supplies', 0, 98, 0);
      w.prop('bunker', -6, 20, 0); w.prop('bunker', 8, 19, 1.2);
      w.prop('sandbag_wall', -16, 22, 0); w.prop('sandbag_wall', 16, 22, 0);
      w.enemies(8, 0, 16, 18, 'bund');
      // Kilinochchi town
      const town = [[-24, -20, 0], [-8, -28, 1.57], [14, -22, 0], [28, -34, 1.57], [-30, -46, 0], [-14, -56, 3.14],
        [16, -54, 0], [30, -66, 1.57], [-28, -76, 0.2], [0, -84, 3.1], [20, -88, 0]];
      town.forEach(([x, z, r], i) => w.prop(i % 3 === 0 ? 'house' : 'house_ruined', x, z, r));
      w.prop('water_tower', -2, -66, 0.4);
      w.prop('sandbag_wall', 4, -40, 0); w.prop('supplies', -4, -36, 0.4);
      w.enemies(12, 0, -50, 26, 'town');
    },
    objectives: [
      { type: 'clear', tag: 'bund', text: 'Clear the bunkers behind the earth bund' },
      { type: 'reach', pos: [0, 28], r: 8, text: 'Breach the earth bund' },
      { type: 'clear', tag: 'town', text: 'Clear Kilinochchi town', spawn: [{ x: 0, z: -110, n: 4, tag: 'town' }] },
      { type: 'reach', pos: [-2, -58], r: 10, text: 'Reach the water tower' },
    ],
  },

  {
    id: 'elephantpass',
    name: 'Elephant Pass',
    si: 'අලිමංකඩ',
    date: 'January 2009',
    place: 'Gateway to the Jaffna peninsula',
    briefing: [
      'Elephant Pass is a narrow causeway between two lagoons — the only land link between the Jaffna peninsula and the mainland. The LTTE overran the army base there in April 2000, cutting Jaffna off by land for nine years.',
      'After Kilinochchi fell, troops pushed north along the A9 while the 53 and 55 Divisions advanced from the Jaffna side.',
      'On 9 January 2009 the army recaptured Elephant Pass and the forces linked up, reopening the A9 road to Jaffna.',
    ],
    debrief: 'Elephant Pass was back in government hands on 9 January 2009. Mullaitivu, the LTTE\'s main military base, fell on 25 January.',
    world: {
      size: 120,
      ground: ['#a49a6a', '#8c8c4c'],
      sky: '#b9d3e3', fog: ['#cfdbe0', 50, 260], water: -0.4,
      height: (x, z) => {
        const road = x - (Math.sin(z * 0.04) * 4 + 2);
        const land = smooth(16, 9, Math.abs(road)) + smooth(14, 4, Math.hypot(x - 22, z + 40)) * 0.8;
        return -2.5 + Math.min(1, land) * (3 + fbm(x * 0.05, z * 0.05) * 0.6);
      },
    },
    player: { x: 0, z: 108 },
    allies: 4,
    shelling: true,
    insertion: 'heli',
    layout(w) {
      w.tower(6, 66, 0, 'south');
      w.tower(-6, -42, 0.3, 'base');
      w.alarm(20, -52, 0, 'base');
      w.scatter('bush', 60, { x0: -14, x1: 30, z0: -118, z1: 118 }, { avoid: [[0, 108, 6]] });
      w.scatter('palm_palmyrah', 18, { x0: -14, x1: 30, z0: -118, z1: 118 }, { avoid: [[0, 108, 8]] });
      w.prop('buffel', 4, 116, 0); w.prop('supplies', -4, 102, 0);
      w.prop('bunker', 0, 60, 0); w.prop('sandbag_wall', -4, 54, 0.1); w.prop('sandbag_wall', 6, 52, -0.2);
      w.enemies(7, 1, 55, 9, 'south');
      // ruins of the old Elephant Pass base
      w.prop('house_ruined', 18, -38, 0); w.prop('house_ruined', 26, -46, 1.5); w.prop('house_ruined', 8, -50, 0.3);
      w.prop('bunker', 2, -20, 0.6); w.prop('bunker', 14, -26, 2);
      w.prop('sandbag_wall', -2, -30, 0); w.prop('supplies', 22, -30, 0);
      w.enemies(10, 10, -36, 14, 'base');
      w.prop('buffel', 6, -112, Math.PI); w.prop('buffel', -3, -118, Math.PI - 0.2);
      w.friendlies(4, 2, -110, 6);
    },
    objectives: [
      { type: 'clear', tag: 'south', text: 'Break through the LTTE line on the causeway' },
      { type: 'clear', tag: 'base', text: 'Recapture the old Elephant Pass base' },
      { type: 'reach', pos: [2, -104], r: 10, text: 'Link up with the 53 Division' },
    ],
  },

  {
    id: 'anandapuram',
    name: 'Anandapuram',
    si: 'ආනන්දපුරම්',
    date: 'April 2009',
    place: 'Puthukkudiyiruppu, Mullaitivu District',
    briefing: [
      'By the end of March 2009 the army had pushed the LTTE back towards the coast around Puthukkudiyiruppu.',
      'In the first days of April, LTTE units were encircled near the village of Anandapuram and fought hard to break out. Both sides suffered heavy losses.',
      'The army reported that several senior LTTE commanders were killed in the battle, which broke much of the LTTE\'s remaining conventional fighting strength.',
    ],
    debrief: 'After Anandapuram the LTTE no longer fought as a conventional army. What remained of it withdrew into the coastal strip with a very large number of civilians.',
    world: {
      size: 120,
      ground: ['#7d7a45', '#8c8a4e'],
      sky: '#b4bcc0', fog: ['#c2bfb2', 30, 210], water: null,
      height: (x, z) => fbm(x * 0.025, z * 0.025) * 3,
    },
    player: { x: 0, z: 102 },
    allies: 4,
    shelling: true,
    insertion: 'apc',
    layout(w) {
      w.scatter('palm_coconut', 150, { x0: -118, x1: 118, z0: -118, z1: 118 },
        { avoid: [[0, 102, 14], [0, 40, 16], [0, -5, 16], [10, -78, 20]] });
      w.scatter('bush', 120, { x0: -118, x1: 118, z0: -118, z1: 118 }, { avoid: [[0, 102, 8], [0, -5, 12]] });
      w.prop('buffel', 10, 112, 0); w.prop('supplies', -8, 104, 0);
      // fighters dug in among the coconut groves
      w.prop('bunker', -10, 42, 0.3); w.prop('bunker', 12, 38, 1.8); w.prop('house_ruined', 26, 48, 0.9);
      w.prop('sandbag_wall', 0, 46, 0);
      w.enemies(7, 0, 40, 16, 'grove');
      // the junction the section must hold
      w.prop('sandbag_wall', -6, 2, 0); w.prop('sandbag_wall', 6, -10, Math.PI / 2); w.prop('sandbag_wall', -8, -12, 0.4);
      w.prop('house_ruined', 12, 6, 0.2); w.prop('supplies', 0, -4, 0);
      // the encircled positions
      for (const x of [-50, -28, 28, 50]) w.prop('earth_bund', x, -62, 0); // a gap in the middle of the bund
      w.prop('bunker', 0, -80, 0.4); w.prop('bunker', 24, -84, 2.2); w.prop('house_ruined', -18, -86, 1.3);
      w.enemies(7, 6, -80, 16, 'ring');
    },
    objectives: [
      { type: 'clear', tag: 'grove', text: 'Clear the positions in the coconut grove' },
      { type: 'defend', zone: [0, -4, 12], time: 75, tag: 'counter', text: 'Hold the junction against the break-out',
        waves: [{ at: 4, x: 60, z: -12, n: 4 }, { at: 28, x: -60, z: 4, n: 4 }, { at: 50, x: 4, z: -50, n: 4 }] },
      { type: 'clear', tag: 'counter', text: 'Clear the remaining attackers' },
      { type: 'clear', tag: 'ring', text: 'Take the encircled positions behind the bund', spawn: [{ x: -10, z: -110, n: 3, tag: 'ring' }] },
    ],
  },

  {
    id: 'puthumathalan',
    name: 'Puthumathalan',
    si: 'පුදුමාත්තලන්',
    date: '20 April 2009 · night',
    place: 'Mullaitivu District, north-east coast',
    night: true,
    briefing: [
      'In April 2009 the LTTE held a narrow coastal strip between the Nandikadal lagoon and the sea. Tens of thousands of civilians were trapped inside it, and an earth bund ran across the strip near Puthumathalan.',
      'On 20 April 2009 troops breached the bund. Over the next few days very large numbers of civilians crossed to government-held areas — more than 100,000 according to government figures.',
      'This mission is set on the night before the crossing. The breach here is fictionalised; the crossing that followed is history.',
    ],
    debrief: 'The breach at Puthumathalan opened the way for the largest single movement of civilians out of the combat zone. Fighting continued on the strip for another month.',
    world: {
      size: 120,
      ground: ['#a49a6a', '#8c8c4c'],
      sky: '#0b1018', fog: ['#0d121c', 15, 150], water: -0.4,
      height: (x, z) => {
        const shore = 40 + Math.sin(z * 0.05) * 6;
        return -2.5 + smooth(shore + 6, shore - 6, x) * (3 + fbm(x * 0.04, z * 0.04) * 0.8);
      },
    },
    player: { x: -20, z: 100 },
    allies: 4,
    insertion: 'apc',
    layout(w) {
      w.scatter('palm_coconut', 80, { x0: -118, x1: 34, z0: -118, z1: 118 }, { avoid: [[-20, 100, 14], [-6, 2, 22], [-10, -50, 14]] });
      w.scatter('palm_palmyrah', 30, { x0: -118, x1: 20, z0: -118, z1: 118 }, { avoid: [[-20, 100, 14], [-6, 2, 22]] });
      w.scatter('bush', 140, { x0: -118, x1: 34, z0: -118, z1: 118 }, { avoid: [[-20, 100, 8], [-6, 2, 8]] });
      w.prop('buffel', -10, 112, 0); w.prop('supplies', -28, 104, 0);
      // the earth bund across the strip, with a sentry tower and an alarm
      for (const x of [-118, -98, -78, -58, -38, -21, 15, 33]) w.prop('earth_bund', x, 0, 0);
      w.tower(-34, -8, 0.2, 'bund');
      w.alarm(12, 7, 0.3, 'bund'); // the siren stands on the near side of the bund
      w.prop('bunker', -14, -12, 0.2); w.prop('bunker', 20, -14, 1.6);
      w.enemies(8, -4, -14, 16, 'bund');
      w.target('breach', -3, 0, { model: 'earth_bund', label: 'the earth bund', blast: 'The bund is breached', time: 4, plant: true });
      // families sheltering behind the line
      w.prop('house_ruined', -20, -46, 0.4); w.prop('hut', 4, -58, 1.2); w.prop('hut', -24, -62, 2.8);
      w.civilians(10, -10, -52, 6);
      w.enemies(6, -6, -78, 16, 'camp');
    },
    objectives: [
      { type: 'alarm', tag: 'bund', text: 'Sabotage the alarm on the bund before you are seen' },
      { type: 'interact', tag: 'breach', text: 'Set the breaching charge on the bund' },
      { type: 'clear', tag: 'bund', text: 'Clear the fighters at the breach' },
      { type: 'clear', tag: 'camp', text: 'Clear the fighters south of the families' },
      { type: 'escort', zone: [-20, 95, 12], via: [-3, 7], text: 'Lead the families through the breach to the army lines', reach: [-10, -52] },
    ],
  },

  {
    id: 'nandikadal',
    name: 'Nandikadal',
    si: 'නන්දිකඩාල්',
    date: 'May 2009',
    place: 'Mullaitivu District, north-east coast',
    briefing: [
      'By May 2009 the remaining LTTE fighters were confined to a narrow strip of land between the Nandikadal lagoon and the sea, together with a very large number of trapped civilians.',
      'In the final weeks, hundreds of thousands of civilians crossed to government-held areas. Many others were killed; the scale of civilian loss in these final months remains the subject of calls for accountability.',
      'Your orders: bring civilians out of the combat zone safely. Civilian casualties are unacceptable — any harm to a civilian ends the mission.',
    ],
    debrief: 'The fighting ended at Nandikadal on 18 May 2009, and the government declared the war over on 19 May.',
    world: {
      size: 120,
      ground: ['#b3a777', '#8e9150'],
      sky: '#c2cbd0', fog: ['#c9c7bb', 30, 200], water: -0.4,
      height: (x, z) => {
        const shore = 30 + Math.sin(z * 0.05) * 6;
        return -2.5 + smooth(shore + 6, shore - 6, x) * (3 + fbm(x * 0.04, z * 0.04) * 0.8);
      },
    },
    player: { x: -20, z: 100 },
    allies: 4,
    shelling: true,
    insertion: 'apc',
    layout(w) {
      w.scatter('palm_coconut', 90, { x0: -118, x1: 30, z0: -118, z1: 118 }, { avoid: [[-20, 100, 14], [-5, -55, 14]] });
      w.scatter('bush', 120, { x0: -118, x1: 30, z0: -118, z1: 118 }, { avoid: [[-20, 100, 8], [-5, -55, 10]] });
      w.prop('buffel', -12, 112, 0); w.prop('supplies', -26, 104, 0);
      w.prop('house_ruined', -40, 20, 0.5); w.prop('house_ruined', 0, 0, 2); w.prop('sandbag_wall', -18, 14, 0);
      w.prop('bunker', -24, 6, 0.3);
      w.enemies(8, -22, 6, 18, 'line');
      w.prop('house_ruined', -14, -48, 0.2); w.prop('house_ruined', 6, -64, 1.7);
      w.civilians(8, -5, -55, 6);
      w.enemies(7, -6, -35, 18, 'nfz');
      w.prop('bunker', -40, -90, 0); w.prop('bunker', 0, -96, 1);
      w.enemies(7, -18, -92, 16, 'last');
    },
    objectives: [
      { type: 'clear', tag: 'line', text: 'Break through the last LTTE defence line' },
      { type: 'clear', tag: 'nfz', text: 'Clear the fighters around the civilians' },
      { type: 'escort', zone: [-20, 95, 12], text: 'Lead the civilians back to army lines', reach: [-5, -55] },
      { type: 'clear', tag: 'last', text: 'Clear the final LTTE position' },
    ],
    epilogue: [
      'The Sri Lankan Civil War lasted from 1983 to 2009.',
      'Tens of thousands of soldiers, LTTE cadres and civilians lost their lives, and hundreds of thousands were displaced.',
      'This game remembers everyone who was lost — on every side — and hopes for lasting peace and reconciliation among all Sri Lankans.',
    ],
  },
];
