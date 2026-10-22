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
      'Talks brokered by the Sri Lanka Monitoring Mission failed. After air strikes on 26 July, ground troops moved in to reopen the gates. The gates were opened again on 8 August 2006.',
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
    layout(w) {
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
      w.target('gate', 31, -50, { label: 'Sluice gate controls', time: 3 });
    },
    objectives: [
      { type: 'clear', tag: 'outpost', text: 'Clear the LTTE outpost in the paddy fields' },
      { type: 'reach', pos: [20, -30], r: 12, text: 'Advance to the Mavil Aru anicut' },
      { type: 'clear', tag: 'gate', text: 'Secure the anicut', spawn: [{ x: 10, z: -90, n: 3, tag: 'gate' }] },
      { type: 'interact', tag: 'gate', text: 'Open the sluice gates' },
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
    layout(w) {
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
    player: { x: 10, z: 105 },
    allies: 3,
    layout(w) {
      w.scatter('palm_palmyrah', 70, { x0: -30, x1: 118, z0: -118, z1: 118 }, { avoid: [[10, 105, 12], [-35, 20, 18], [10, -80, 25]] });
      w.scatter('palm_coconut', 45, { x0: -40, x1: 60, z0: -118, z1: 118 }, { avoid: [[10, 105, 12], [-35, 20, 18], [10, -80, 25]] });
      w.scatter('bush', 120, { x0: -35, x1: 118, z0: -118, z1: 118 }, { avoid: [[10, 105, 8]] });
      w.prop('buffel', 18, 112, -0.2); w.prop('supplies', 4, 110, 0);
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
    layout(w) {
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
    layout(w) {
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
