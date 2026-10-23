// Story layer for the campaign.
//
// Everything in this file is FICTION written for the game (characters, radio
// dialogue, squad scenes) — except HISTORY_TIMELINE, HUMAN_COST and SOURCES,
// which summarise documented history. Historical mission text lives in
// missions.js; gameplay logic lives in main.js.

export const CHARACTERS = {
  awan: { name: 'Awan', role: 'Section commander (you)', color: '#e0b84a' },
  ruwan: { model: 'soldier_army', name: 'Sgt. Ruwan Jayasekara', short: 'Sgt. Ruwan', role: 'Section sergeant · rifleman', color: '#9bd16a',
    bio: 'Fifteen years in uniform. His older brother was at Elephant Pass when it fell in 2000. Calls you "Sir" with a grin.' },
  nimal: { model: 'soldier_army', name: 'Cpl. Nimal "Nimo" Fernando', short: 'Cpl. Nimal', role: 'Support gunner', color: '#7fc8e8',
    bio: 'From Negombo. Jokes under fire, misses his mother\'s kiribath and organises every celebration.' },
  kasun: { model: 'soldier_ghillie', ai: 'marksman', name: 'L/Cpl. Kasun Herath', short: 'L/Cpl. Kasun', role: 'Recon · marksman (SVD, ghillie suit)', color: '#e89a6a',
    bio: 'The youngest. Writes letters to his little sister in Anuradhapura. Sees everything first.' },
  prakash: { model: 'soldier_sf', name: 'Pte. Prakash Rajan', short: 'Pte. Prakash', role: 'Medic · Tamil interpreter', color: '#d79be8',
    bio: 'A Tamil soldier from Batticaloa. Patches everyone up, and speaks to frightened families in their own language.' },
  sunil: { model: 'soldier_army', name: 'Pte. Sunil Dias', short: 'Pte. Sunil', role: 'Rifleman (replacement)', color: '#b8c4a0',
    bio: 'Joins the section after Kilinochchi. Eager, nervous, brave.' },
  command: { name: 'Lion Actual', short: 'Command', role: 'Radio', color: '#f2eedf' },
  saraswathi: { name: 'Mrs. Saraswathi', short: 'Saraswathi', role: 'Civilian', color: '#f0d0a0' },
  tip: { name: 'TIP', short: 'TIP', role: '', color: '#e0b84a' },
};

// The squad introduced in the prologue
export const SQUAD_INTRO = ['ruwan', 'nimal', 'kasun', 'prakash'];

// Ranks of the Sri Lanka Army officer corps used for progression
export const RANKS = [
  { id: '2lt', name: 'Second Lieutenant', short: '2nd Lt.', xp: 0, pips: 1 },
  { id: 'lt', name: 'Lieutenant', short: 'Lt.', xp: 2000, pips: 2 },
  { id: 'capt', name: 'Captain', short: 'Capt.', xp: 5000, pips: 3 },
  { id: 'maj', name: 'Major', short: 'Maj.', xp: 12000, pips: 0, emblem: true },
];

// Fictional game commendations (not real military decorations)
export const MEDALS = {
  water: { name: 'Water Bearer', desc: 'Reopen the Mavil Aru sluice gates.' },
  jungle: { name: 'Ghost of Baron\'s Cap', desc: 'Complete Thoppigala on Veteran.' },
  coast: { name: 'Coast Watcher', desc: 'Destroy every Sea Tiger boat at Nachchikuda.' },
  bund: { name: 'Bund Breaker', desc: 'Break the Kilinochchi defence line.' },
  causeway: { name: 'Road Home', desc: 'Link up with the 53 Division at Elephant Pass.' },
  shield: { name: 'Shield of the Innocent', desc: 'Complete Nandikadal without a single shot near a civilian.' },
  steady: { name: 'Steady Hand', desc: 'Finish any mission with 60% accuracy or better.' },
  veteran: { name: 'Veteran of the Wanni', desc: 'Complete the whole campaign.' },
};

// ---------------------------------------------------------------- missions
// Each mission: squad (allies in order), fiction text for briefing/debrief,
// radio lines on start, per objective (by index), on events, and at the end.
// A line is [speaker, text].

export const STORY = {
  mavilaru: {
    squad: ['ruwan', 'nimal', 'kasun'],
    briefing: 'Second Lieutenant Awan has led this section for eleven days. Sergeant Ruwan Jayasekara has fifteen years in uniform. Today is the day they find out what that difference means.',
    intro: [
      ['command', 'Lion Actual to Two-One. You are cleared to advance. Enemy outpost reported in the paddy fields north of you.'],
      ['ruwan', 'First real one, Sir. Keep low along the bunds and let them come to us.'],
      ['nimal', 'Thirty thousand acres of paddy and not a drop of water. My amma would be furious.'],
      ['tip', 'Right-click to aim, left-click to fire, R to reload, Shift to sprint.'],
      ['kasun', 'Movement near the bunkers. I count five… maybe six.'],
    ],
    objectives: {
      1: [
        ['ruwan', 'Outpost is clear. Good work, Sir. The anicut is north-east — follow the canal.'],
        ['tip', 'Walk over a supply crate to refill ammunition and grenades. C crouches, Z goes prone — bushes hide you.'],
        ['tip', 'Squad orders: T follow / hold · V send Bravo team to where you aim · X weapons free / tight.'],
      ],
      2: [
        ['command', 'Two-One, expect heavier resistance at the gates. Other sections are pushing on your flank.'],
        ['kasun', 'Bunkers both sides of the canal. Sandbags on the right.'],
      ],
      3: [
        ['ruwan', 'Gate controls are on the west end. Get on the wheel, Sir — we\'ll cover you.'],
        ['tip', 'Hold E at the gate controls.'],
      ],
    },
    events: {
      contact: [['nimal', 'Contact front! Get down!']],
      hurt: [['ruwan', 'You\'re hit, Sir — into cover, let it pass.']],
    },
    outro: [
      ['nimal', 'Listen… that\'s water.'],
      ['ruwan', 'First day done, Sir. There will be harder ones.'],
    ],
    debrief: 'Water reached the paddy fields that evening. Nimal swore he could already smell the rice. In his notebook Awan wrote one line: "Everyone came back."',
  },

  thoppigala: {
    squad: ['ruwan', 'kasun', 'prakash'],
    briefing: 'Eleven months later. The army now fights in small teams: eight soldiers, no roads, days without resupply. Kasun has become the section\'s eyes, and Private Prakash — a medic from Batticaloa — has joined them.',
    intro: [
      ['command', 'Two-One, you are the left-hand team. Stay off the main tracks — they\'re mined.'],
      ['ruwan', 'Single file. Watch where Kasun steps, and step there.'],
      ['kasun', 'Smoke from a cooking fire, eleven o\'clock. That\'s the first camp.'],
      ['tip', 'Enemies who have not seen you will not fire. Gunfire alerts everyone nearby — pick your moment.'],
    ],
    objectives: {
      1: [
        ['kasun', 'Siren on a pole beside the second camp. If one of them reaches it, the whole jungle wakes up.'],
        ['tip', 'Press B for binoculars and look at sentries to mark them. Hold E at the alarm to sabotage it. C crouches, Z goes prone.'],
      ],
      2: [['prakash', 'This jungle is like the one near my grandmother\'s village. When it is this quiet, someone is listening.']],
      3: [['ruwan', 'There it is. Baron\'s Cap. The British named it. The Tigers held it for twenty years.']],
      4: [
        ['command', 'All teams converge on the rock. Final push.'],
        ['kasun', 'Sentries on the slopes. I\'ll call them out.'],
      ],
    },
    events: {
      contact: [['kasun', 'They\'ve seen us — contact!']],
      hurt: [['prakash', 'Sir, you\'re bleeding. Stay down, I\'m coming.']],
    },
    outro: [
      ['kasun', 'From up here you can see the sea.'],
      ['ruwan', 'The East is done. Next it will be the North.'],
    ],
    debrief: 'The section rested two days in Batticaloa. Prakash took them to his grandmother, who fed everyone and asked only one question: "When will it end?" Nobody had an answer.',
  },

  pooneryn: {
    squad: ['ruwan', 'nimal', 'kasun'],
    briefing: 'A year of flooded paddy and mangroves up the north-west coast. Lieutenant Awan\'s section is attached to the coastal advance. Tonight\'s target is a boat yard.',
    intro: [
      ['command', 'Two-One, Lion Actual. Sea Tiger craft reported at Nachchikuda. Clear the yard and deny those boats.'],
      ['ruwan', 'Boats on the beach, guards in the bunkers. We clear first, then the charges.'],
      ['nimal', 'Sea breeze. Smell that? Better than a year of mud.'],
    ],
    objectives: {
      1: [
        ['kasun', 'Three boats. Fuelled — they were leaving tonight.'],
        ['tip', 'Hold E beside a boat to plant a charge, then move away. Press 3 for Kasun\'s spare SVD — right-click to scope.'],
      ],
      2: [
        ['command', 'Good work. Pooneryn is ahead on the A-32. Push on.'],
        ['nimal', 'Families have fished this coast for generations. I hope they can again.'],
      ],
      3: [['ruwan', 'House to house now. Check your corners. Check your fire.']],
    },
    events: {
      contact: [['nimal', 'Bunker fire, left side!']],
      hurt: [['ruwan', 'Sir! Stay behind something solid.']],
    },
    outro: [
      ['command', 'Two-One, Pooneryn is secure. The whole western coast is clear.'],
      ['nimal', 'Next stop Kilinochchi. They say the rain there falls like the sky has a hole in it.'],
    ],
    debrief: 'At dawn the section watched the first fishing boat in years push off from the Pooneryn shore. Nimal waved until it was out of sight.',
  },

  kilinochchi: {
    squad: ['ruwan', 'nimal', 'kasun', 'prakash'],
    briefing: 'The monsoon came with the army. For weeks the section has lived in flooded trenches facing the earth bunds. Awan now knows the names of every soldier\'s children.',
    intro: [
      ['command', 'All callsigns, Lion Actual. The bund line breaks today.'],
      ['ruwan', 'Bunkers behind the gap. Through the gap and nowhere else — the rest is mined.'],
      ['kasun', 'I\'ll watch the left. Let\'s get out of this rain.'],
    ],
    objectives: {
      1: [['nimal', 'Mud to the knees. Feels like home in Negombo.']],
      2: [
        ['command', 'Heavy resistance reported in the town centre.'],
        ['prakash', 'The families were moved out east weeks ago. Only fighters are left here.'],
      ],
      3: [['kasun', 'The water tower… they blew it up.']],
    },
    events: {
      contact: [['ruwan', 'Contact, behind the bund!']],
      hurt: [['prakash', 'Sir — you\'re hit. Get down, I\'m on my way.']],
    },
    outro: [
      ['prakash', 'Kasun\'s hit — shoulder! He\'ll live. Get the casevac in!'],
      ['kasun', 'Sir… save me a place for the end of this.'],
    ],
    debrief: 'Kasun was evacuated to Anuradhapura. From the hospital he wrote to his sister that the rain had stopped. The section moved north with one empty place.',
  },

  elephantpass: {
    squad: ['ruwan', 'nimal', 'prakash', 'sunil'],
    briefing: 'The pips on his shoulder still feel new. A replacement, Private Sunil, has joined the section. Sergeant Ruwan is quieter than usual: his brother was here when the base fell in 2000.',
    intro: [
      ['command', 'Two-One, the causeway is the only way north. Snipers in the towers, lagoon on both sides.'],
      ['ruwan', 'My brother left this place in 2000. Carried out, actually. Let\'s walk in.'],
      ['sunil', 'Private Sunil reporting, Sir. I won\'t slow you down.'],
    ],
    objectives: {
      1: [['ruwan', 'The old base. I know these water tanks from his photographs.']],
      2: [['command', 'The 53 Division is coming south towards you. Watch your fire — friendlies ahead.']],
    },
    events: {
      contact: [['sunil', 'Contact! Contact front!']],
      hurt: [['prakash', 'Captain, you\'re hit — stay low!']],
    },
    outro: [
      ['ruwan', 'For the first time in nine years you can drive from Colombo to Jaffna.'],
      ['nimal', 'I\'m going to drive it. With music.'],
    ],
    debrief: 'That night Ruwan called his brother on a borrowed phone. He didn\'t say much. Only: "I was there today. It\'s open again."',
  },

  nandikadal: {
    squad: ['ruwan', 'nimal', 'prakash', 'kasun'],
    briefing: 'May 2009. Kasun has talked his way out of hospital. The orders are different now: open a way out for families trapped on the strip. Prakash will speak to them in Tamil.',
    intro: [
      ['command', 'Two-One, civilians are trying to reach our lines. Their safety is your priority. Weapons tight around non-combatants.'],
      ['prakash', 'Let me go first when we reach them, Sir. They have been told terrible things about us.'],
      ['kasun', 'I wasn\'t going to miss the end, Sir.'],
      ['tip', 'Civilians follow you when you get close. Lead them to the army position in the south. Never fire towards them.'],
    ],
    objectives: {
      1: [['ruwan', 'Fighters between us and the families. Careful shots only.']],
      2: [
        ['prakash', 'Amma, inge vaanga — come this way. You are safe now.'],
        ['saraswathi', 'My grandson has not eaten for two days. Is it true… we can go?'],
        ['prakash', 'It is true, Amma. Walk with me.'],
      ],
      3: [
        ['command', 'Two-One, final enemy position north of you.'],
        ['ruwan', 'Then we go home.'],
      ],
    },
    events: {
      contact: [['nimal', 'Fire from the treeline — keep the families behind us!']],
      hurt: [['prakash', 'Sir, you\'re hit. Stay with me.']],
      allSafe: [['prakash', 'They\'re all across. All of them.']],
      civilianWarning: [['ruwan', 'Check your fire, Sir! Families!']],
    },
    outro: [
      ['ruwan', 'It\'s over, Sir.'],
      ['prakash', 'So many are not going home. On every side.'],
    ],
    debrief: 'Kavin, Mrs. Saraswathi\'s grandson, gave Prakash a drawing of a fishing boat. Years later Prakash still keeps it in his wallet.',
  },
};

// ---------------------------------------------------------------- prologue

export const PROLOGUE = {
  opening: ['Sri Lanka.', '1983 – 2009.', 'A war that lasted twenty-six years.'],
  history: [
    'In 2002 the government and the LTTE signed a ceasefire. By 2006 it had collapsed.',
    'On 21 July 2006 the LTTE closed the sluice gates of the Mavil Aru anicut. The fighting that followed became Eelam War IV.',
  ],
  fiction: 'The characters in this story are fictional. The places, dates and operations around them are real.',
  places: [
    { name: 'Mavil Aru', date: 'Jul 2006', lat: 8.32, lon: 81.22, dx: 8, dy: 4 },
    { name: 'Thoppigala', date: 'Jul 2007', lat: 7.82, lon: 81.40, dx: 8, dy: 4 },
    { name: 'Pooneryn', date: 'Nov 2008', lat: 9.50, lon: 80.21, dx: -8, dy: -4, anchor: 'end' },
    { name: 'Kilinochchi', date: 'Jan 2009', lat: 9.39, lon: 80.40, dx: -8, dy: 18, anchor: 'end' },
    { name: 'Elephant Pass', date: 'Jan 2009', lat: 9.55, lon: 80.42, dx: 8, dy: -6 },
    { name: 'Nandikadal', date: 'May 2009', lat: 9.33, lon: 80.74, dx: 8, dy: 6 },
  ],
};

// Simplified outline of Sri Lanka (lat, lon), clockwise from the north-west of the Jaffna peninsula
export const ISLAND = [
  [9.72, 79.95], [9.82, 80.08], [9.83, 80.24], [9.70, 80.38], [9.58, 80.52], [9.42, 80.60], [9.25, 80.80],
  [8.98, 80.95], [8.75, 81.10], [8.57, 81.24], [8.30, 81.38], [8.00, 81.55], [7.72, 81.70], [7.35, 81.85],
  [7.00, 81.88], [6.70, 81.82], [6.40, 81.65], [6.20, 81.40], [6.10, 81.12], [5.96, 80.80], [5.95, 80.55],
  [6.03, 80.22], [6.30, 80.05], [6.60, 79.97], [6.93, 79.85], [7.25, 79.83], [7.60, 79.80], [8.00, 79.75],
  [8.35, 79.85], [8.70, 79.92], [8.95, 79.92], [9.08, 80.02], [9.25, 80.08], [9.40, 80.12], [9.50, 80.28],
  [9.54, 80.40], [9.60, 80.30], [9.65, 80.10], [9.68, 79.95],
];
export const MANNAR = [[9.02, 79.72], [9.08, 79.80], [9.02, 79.92], [8.97, 79.85]];

// ---------------------------------------------------------------- history (documented)

export const HISTORY_TIMELINE = [
  ['July 1983', 'An LTTE ambush kills 13 soldiers near Thirunelveli; the anti-Tamil riots of "Black July" follow. Open war begins.'],
  ['1987 – 1990', 'Indo-Sri Lanka Accord; the Indian Peace Keeping Force fights the LTTE and withdraws in March 1990.'],
  ['1990 – 1995', 'Eelam War II. In 1995 the peace talks fail and Eelam War III begins; the army retakes Jaffna in December 1995.'],
  ['April 2000', 'The Elephant Pass base falls to the LTTE, cutting Jaffna off by land.'],
  ['February 2002', 'A Norway-brokered ceasefire is signed and monitored by the SLMM.'],
  ['July 2006', 'The LTTE closes the Mavil Aru sluice gates; the military operation that follows begins Eelam War IV.'],
  ['July 2007', 'Thoppigala is captured; the government declares the Eastern Province cleared.'],
  ['November 2008', 'Pooneryn is taken; the western coast is in government hands.'],
  ['January 2009', 'Kilinochchi (2 Jan), Elephant Pass (9 Jan) and Mullaitivu (25 Jan) fall to the army.'],
  ['April 2009', 'The battle of Anandapuram; at Puthumathalan the army breaches the LTTE bund and very large numbers of civilians cross to government-held areas.'],
  ['18 – 19 May 2009', 'The last fighting at Nandikadal. The government declares the war over.'],
];

export const HUMAN_COST = [
  'Estimates of the total dead from 1983 to 2009 run to around 80,000–100,000 people — soldiers, police, LTTE cadres and civilians of every community.',
  'In the final months, civilians trapped in the shrinking combat zone suffered most. The UN Secretary-General\'s Panel of Experts (2011) reported credible allegations against both sides: that LTTE cadres prevented civilians from leaving and shot some who tried, and that government shelling caused most civilian deaths. Its figures and findings remain disputed, and calls for accountability continue.',
  'Around 300,000 displaced people were held in camps after the war ended. Over the following years, former cadres went through rehabilitation, large areas were cleared of landmines, and roads, railways and towns were rebuilt.',
];

export const SQUAD_EPILOGUE = [
  ['ruwan', 'Retired in 2014. He and his brother drive the A9 to Jaffna every year.'],
  ['nimal', 'Opened a small kiribath shop in Negombo. Veterans eat free.'],
  ['kasun', 'Became a teacher in Anuradhapura. His sister became a doctor.'],
  ['prakash', 'Returned to Batticaloa to work as a nurse. He still keeps a child\'s drawing of a boat.'],
  ['awan', 'Never talks about the war. Every 19th of May he lights a lamp for everyone who did not come home — on every side.'],
];

export const CLOSING = 'This game remembers everyone who was lost — soldiers, cadres and civilians, Sinhala, Tamil and Muslim — and hopes for lasting peace and reconciliation among all Sri Lankans.';

export const SOURCES = [
  ['Eelam War IV — Wikipedia', 'https://en.wikipedia.org/wiki/Eelam_War_IV'],
  ['Northern Theatre of Eelam War IV — Wikipedia', 'https://en.wikipedia.org/wiki/Northern_Theatre_of_Eelam_War_IV'],
  ['Eastern Theatre of Eelam War IV — Wikipedia', 'https://en.wikipedia.org/wiki/Eastern_Theatre_of_Eelam_War_IV'],
  ['Battle of Kilinochchi (2008–2009) — Wikipedia', 'https://en.wikipedia.org/wiki/Battle_of_Kilinochchi_(2008%E2%80%932009)'],
  ['58 Division (Sri Lanka) — Wikipedia', 'https://en.wikipedia.org/wiki/58_Division_(Sri_Lanka)'],
  ['Report of the UN Secretary-General\'s Panel of Experts on Accountability in Sri Lanka (2011) — Wikipedia summary', 'https://en.wikipedia.org/wiki/Report_of_the_Secretary-General%27s_Panel_of_Experts_on_Accountability_in_Sri_Lanka'],
  ['International Crisis Group — Sri Lanka\'s War: The Final Phase (2009)', 'https://www.crisisgroup.org/asia/south-asia/sri-lanka'],
  ['Sunday Observer — "Pooneryn falls" (16 Nov 2008)', 'https://archives.sundayobserver.lk/2008/11/16/sec03.asp'],
  ['The Sri Lankan Civil War (1983–2009): monograph supplied by the project author (PDF, not published)', null],
];

// ---------------------------------------------------------------- progression

export function rankFor(xp) {
  let r = RANKS[0];
  for (const k of RANKS) if (xp >= k.xp) r = k;
  return r;
}

export function nextRank(xp) {
  return RANKS.find((k) => k.xp > xp) || null;
}

const DIFF_MULT = (d) => (d < 0.8 ? 0.8 : d > 1.2 ? 1.3 : 1);

// Deterministic XP for one mission result; returns { total, lines }
export function missionXP(r) {
  const lines = [['Mission complete', 1000], [`Objectives × ${r.objectives}`, 150 * r.objectives]];
  if (r.hasCivilians && r.civilianIncidents === 0) lines.push(['No shots near civilians', 300]);
  if (r.accuracy >= 40) lines.push(['Accuracy ≥ 40%', 150]);
  if (r.difficulty > 1.2) lines.push(['Veteran difficulty', 250]);
  const base = lines.reduce((s, [, v]) => s + v, 0);
  const mult = DIFF_MULT(r.difficulty);
  if (mult !== 1) lines.push([`Difficulty × ${mult}`, Math.round(base * mult) - base]);
  return { total: Math.round(base * mult), lines };
}

export function medalsFor(missionId, r) {
  const m = [];
  if (missionId === 'mavilaru') m.push('water');
  if (missionId === 'thoppigala' && r.difficulty > 1.2) m.push('jungle');
  if (missionId === 'pooneryn') m.push('coast');
  if (missionId === 'kilinochchi') m.push('bund');
  if (missionId === 'elephantpass') m.push('causeway');
  if (missionId === 'nandikadal' && r.civilianIncidents === 0) m.push('shield');
  if (r.accuracy >= 60) m.push('steady');
  return m;
}
