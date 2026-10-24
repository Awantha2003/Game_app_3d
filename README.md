# Wanni Front — Eelam War IV (2006–2009)

**වන්නි සටන් බිම** is a 3D third-person game that runs in the browser. You play a Sri Lanka Army soldier through ten real operations from the final phase of the Sri Lankan Civil War. All 3D models are built in **Blender** with a Python script, and the game runs on **Three.js**.

**Play online:** https://wanni-front.vercel.app. It is hosted on Vercel, and every push to `main` deploys automatically. Use a desktop browser with a mouse and keyboard.

![Mavil Aru](docs/mavil-aru.png)

## Campaign

| # | Mission | Date | What happened |
|---|---------|------|---------------|
| 1 | **Mavil Aru** · මාවිල් ආරු | Jul–Aug 2006 | The LTTE closed the anicut's sluice gates on 21 July 2006. Troops reopened them on 8 August, and this is usually seen as the start of Eelam War IV. |
| 2 | **Sampur** · සාම්පූර් | Aug–Sep 2006 | LTTE guns at Sampur could shell Trincomalee harbour. Troops entered Sampur on 4 September 2006. You destroy the gun line with charges. |
| 3 | **Vakarai** · වාකරේ | Jan 2007 | Tens of thousands of civilians left the area before troops took Vakarai on 19 January 2007. You bring families to the boats; Prakash joins the section. |
| 4 | **Thoppigala** · තොප්පිගල | Jul 2007 | The LTTE's last eastern stronghold, "Baron's Cap", was captured on 11 July 2007. |
| 5 | **Pooneryn** · පූනරින් | Nov 2008 | Task Force 1 / 58 Division took Nachchikuda's Sea Tiger base, then entered Pooneryn on 15 Nov 2008 (12 GW and 10 GR). |
| 6 | **Kilinochchi** · කිලිනොච්චිය | Nov 2008 – Jan 2009 | Troops broke the earth-bund defences and took the LTTE's administrative centre on 2 Jan 2009. The toppled water tower is in the game. |
| 7 | **Elephant Pass** · අලිමංකඩ | Jan 2009 | The causeway was retaken on 9 Jan 2009, which reopened the A9 land route to Jaffna. |
| 8 | **Anandapuram** · ආනන්දපුරම් | Apr 2009 | LTTE units encircled near Anandapuram fought to break out. You hold a junction against counter-attack waves. |
| 9 | **Puthumathalan** · පුදුමාත්තලන් | 20 Apr 2009 (night) | Troops breached the LTTE bund; very large numbers of civilians crossed over the following days. A night mission with night vision: silence the siren, breach the bund, lead families out. The breach itself is fictionalised. |
| 10 | **Nandikadal** · නන්දිකඩාල් | May 2009 | You lead civilians out of the combat zone. The war ended on 18–19 May 2009. |

Each mission has a historical briefing and debrief. The campaign ends with an epilogue that remembers everyone who died: soldiers, LTTE cadres and civilians. Civilians are never targets. Aiming at a civilian and killing them fails the mission.

![Nandikadal](docs/nandikadal.png)

## Story campaign

You play **Awan**, a fictional officer who starts as a Second Lieutenant. He leads his section — Sgt. Ruwan, Cpl. Nimal, L/Cpl. Kasun, Pte. Prakash — through ten missions, from Mavil Aru (2006) to Nandikadal (2009).

- **Prologue cinematic.** Rain and thunder, a map of Sri Lanka with the ten operations, a fly-over that introduces the squad, then the title. You can skip it with the button, Esc, Space or Enter.
- **Radio dialogue.** Every mission has spoken lines (as subtitles) at the start, for each objective, for events like first contact or being wounded, and at the end.
- **Briefings and debriefs** keep the **Historical record** and the **Your section — fiction** text clearly apart.
- **XP, ranks and commendations.** The ranks are Second Lieutenant → Lieutenant → Captain → Major. Only your best result per mission counts, so replaying never doubles XP. When you are promoted, the squad celebrates with kiribath and tea.
- **Menus:** Continue Campaign, New Campaign, Mission Selection, Squad, Player Profile (with reset), Historical Archive (timeline, human cost, sources), Settings (sensitivity, volume, difficulty, graphics), Loadout, Co-op and Credits.
- **Epilogue:** a historical timeline, the human cost on every side, where the fictional squad ended up, and a message of remembrance.

## Tactical gameplay

- **Stances:** C crouches, Z goes prone, Space stands up. Enemies see you more slowly when you crouch, go prone, keep still or hide in bushes.
- **Stealth AI:** LTTE cadres patrol or guard their posts. Each one has a field of view and a detection meter, shown as arcs around your crosshair. When they notice something they become suspicious, then search, then fight. They also hear gunshots and running footsteps. A HUD tag shows HIDDEN, SUSPICIOUS, SPOTTED or ALARM.
- **Alarms:** an alerted cadre runs for the camp siren. If he reaches it, reinforcements arrive. You can sabotage an alarm by holding E. Thoppigala has an alarm objective.
- **Watchtowers:** sentries with long sightlines. You can climb a tower yourself with E.
- **Weapons:** 1 is the T-56. 2 is a suppressed pistol, heard only about 9 m away. 3 is the SVD with a scope; it sways, and holding Shift holds your breath to steady it. G throws a grenade.
- **Binoculars (B):** look at a hostile to mark him on the HUD and the map.
- **Tactical map (M):** shows the terrain, buildings, towers, alarms, supplies, your squad and marked hostiles.
- **Squad orders:** T makes the squad follow or hold. V sends Bravo team to the point you are aiming at, so the team can split and flank. X sets weapons free or tight. While weapons are tight, allies fire only once the enemy is alerted. They copy your stance so they don't give you away. Kasun is a marksman in a ghillie suit.
- **Squad roles:**
  - **Prakash, the medic,** runs to whoever is badly wounded, with you first. Press H to call him. He has six field dressings per mission, and a supply crate tops them up to at least three. Without a medic, your wounds heal only to 60%. A crate's first-aid kit takes you to 80%.
  - **Nimal, the support gunner,** carries a machine gun. His long bursts suppress cadres, and so do your own rounds landing close to them. A suppressed cadre ducks and fires far less accurately.
  - **Cover and flanking:** in a fight, cadres and your section look for a spot behind sandbags, bunkers, rocks, trees or buildings that blocks the enemy's line of sight. They crouch there and rise to shoot. Some cadres work round the side, and a squadmate calls it out ("They're flanking — left side!").
- **Jump and crawl:** Space jumps when you are standing, and stands you up when you are crouched or prone. Z goes prone so you can crawl.
- **Enemy weapons:** a fallen cadre drops his weapon. Most carry T-56 rifles, sentries carry SVDs, and some carry machine guns. Walk up and hold E (or tap E) to take it: the same weapon gives you its ammunition, and a different one swaps into its slot (rifle or machine gun as primary, SVD as marksman rifle) while your old weapon is dropped. Q cycles weapons.
- **Planning on the map:** open the map (M or the MAP button). Tap or click any spot to send Bravo team there, or switch the order to the whole section. Planned moves are drawn on the map. On a desktop the mouse is freed while the map is open.
- **Phones:** a visible MOVE joystick that follows your thumb. Pushing it all the way forward runs, and also lowers an aimed weapon. RUN toggles running. On-screen buttons for jump, crouch, prone, map, weapon, grenade, binoculars, squad, medic and night vision, plus move, look, fire, aim (toggle), reload, interact and run. In portrait the camera pulls back with a wider field of view and the HUD is compacted. A hint suggests turning the phone sideways, which still gives the best view.
- **Loadout:** choose your gear from the menu or the briefing. Some items unlock by rank:
  - **Primary weapon:** T-56 rifle, or a light machine gun with a 100-round belt (Lieutenant). The machine gun makes you slower and takes longer to reload.
  - **Equipment:** three grenades, extra magazines (+50% ammunition, Lieutenant), or a pouch of five grenades (Captain).
  - **Night-vision goggles** (Captain), toggled with N. They are always issued for night missions, and cadres see much less in the dark.
  - Locked items fall back to standard issue.
- **New objective type, *hold*:** stay inside the marked position until the timer runs out while counter-attack waves arrive from different directions.
- **Insertion scenes:** the squad arrives by Bell 212-style helicopter (Thoppigala, Elephant Pass), by Navy Arrow boat onto the Pooneryn beach, or by Buffel APC. You can skip them with Space.

## Co-op (2 players)

Choose **Co-op** in the main menu, then **Host a game**, and send the invite link to a friend. When they open it, the two browsers connect directly over WebRTC. The public PeerJS server is used only to introduce them. The host picks any mission they have unlocked and starts it.

- The host's game runs the mission: AI, objectives, civilians and damage. The guest moves and shoots their own soldier.
- The guest's hits, grenades, alarm sabotage and charges are sent to the host, who applies them. The host sends the state of every unit about 15 times a second.
- Both players earn XP. If either player is killed, the mission fails.
- If the guest disconnects, the host carries on alone. If the host disconnects, the guest's mission ends.
- Insertion cinematics are skipped in co-op.
- Limitations: there is no relay (TURN) server, so some strict corporate or mobile networks can block the direct connection. Only two players are supported.

## Environment and presentation

- **Vegetation:** rainforest trees with buttress roots and hanging vines, a second broad-crowned tree, coconut and palmyrah palms, ferns, banana plants, fallen logs, cadjan-roofed village huts and bushes. Leaves are alpha-tested cards painted in Blender, and they sway in the wind.
- **Ground:** the terrain blends grass, dry grass, dirt, mud and sand textures with normal maps. Tiling is broken up with two rotated scales. Dirt tracks lead from the start through each objective. Camps sit in cleared ground. Shores have sand. Canopies shade the ground beneath them. Grass is made of instanced cards in tiles, and distant tiles are culled. Leaf litter covers the forest floor.
- **Atmosphere per mission** (`src/atmosphere.js`):
  - Mavil Aru: humid morning.
  - Thoppigala: dawn ground mist.
  - Pooneryn: dusk over the sea.
  - Kilinochchi: monsoon rain with puddles, wet ground and lightning.
  - Elephant Pass: midday haze and dust.
  - Nandikadal: smoke columns on the horizon.
  - Every mission has a sky dome with clouds and a sun glow. The sky also gives image-based light and reflections. Fog fades into the horizon, and distant hills sit beyond the play area. Fog is kept far enough out that enemies at normal engagement range stay visible.
- **Post-processing** (`src/postfx.js`): ACES tone mapping and a colour grade per mission, with saturation, contrast, tint, vignette and grain. High quality adds 4× MSAA and a subtle bloom.
- **Soldiers:** rounded limbs and torso, a load-bearing vest with magazine pouches, a patrol pack with a rolled poncho, a water bottle, bloused boots, and a face with nose, ears, eyes and eyebrows. Army soldiers wear a cloth-covered helmet with a chin strap. The Special Forces soldier wears a boonie hat and face paint. The camouflage is drawn at a finer DPM scale.
- **Presentation:**
  - The menu background slowly flies over the real mission map.
  - Missions fade up from black. Letterbox bars and a title card frame the insertion.
  - On success, an outro camera pulls away from the section before the debrief.
  - Soft contact shadows ground every soldier.
- **Graphics quality** (Settings):
  - Low: no shadows or post effects, and sparse grass.
  - Medium: 1024 shadows and the colour grade.
  - High: 2048 shadows, MSAA, bloom and dense grass.

The full design and roadmap (new missions, squad orders, weapons, co-op with invite links) are in [`docs/GAME_PLAN.md`](docs/GAME_PLAN.md).

## Testing

```bash
npx playwright install chromium   # once
npm run test:campaign             # a bot plays all ten missions in headless Chromium
npm run test:campaign -- 0 3      # only missions 1 and 4
```

`node tests/shots.mjs <dir> [low|medium|high] [mission indices]` saves a gameplay screenshot of each mission and prints draw calls and triangles (run `npm run build` first).

`npm run test:coop` runs a local PeerServer and connects two headless browser pages. It checks the invite link, the mission start, unit and position sync, the guest's hits, objective progress, mission completion and XP for the guest, and a disconnect.

`npm run build && npm run test:mobile` checks phone controls in portrait: the joystick is visible, aiming the T-56 does not show the sniper scope, and the joystick walks and runs.

`npm run build && npm run test:systems` checks the medic, natural healing to 60%, suppression, the gunner's machine gun, cover search, rank-locked loadout items, the machine gun and grenade pouch, night vision and the loadout screen.

The campaign test checks the start screen, prologue skip, every menu screen, each mission's completion, debrief XP, the promotions, the epilogue, saving across a reload, and that there are no page errors.

## Two versions

- **Unity (first-person, IGI-style)**: [`unity/WanniFront`](unity/WanniFront/README.md). Stealth AI with detection meters, camp alarms, watchtowers, binoculars with enemy marking, a tactical map, a T-56 rifle, a suppressed pistol, an SVD sniper rifle and grenades, Unity Terrain with grass, and rain or a different time of day per mission. Open it with Unity 6 LTS and press Play.
- **Web (third-person, Three.js)**: the root of this repo. It runs in any browser and on phones.

Both versions use the same Blender models from `blender/build_assets.py`.

## Gameplay (web version)

- Third-person shooter with a Type 56 (T-56) rifle, aim down sights, recoil, reloading and ammo resupply at supply crates
- Each mission has a chain of objectives: clear areas, reach locations, open the Mavil Aru sluice gates, plant charges on Sea Tiger boats, and escort civilians
- An AI squad follows you and fights with you. LTTE cadres keep watch, alert each other and fight back
- Procedural terrain for paddy fields, jungle, lagoons and the Elephant Pass causeway
- HUD with a compass, an objective waypoint, health and ammo. All sound effects are generated in the browser (Web Audio)
- Three difficulty levels. Progress is saved in your browser
- Touch controls for phones and tablets

**Controls:** `WASD` move · mouse aim · left click fire · right click aim · `Shift` sprint · `R` reload · `E` interact · `Esc` pause

## Running the game

```bash
npm install
npm run dev        # open the printed URL (http://localhost:5173)
npm run build      # production build in dist/ (static, any web host / GitHub Pages)
```

## Blender models

![Blender models](docs/blender-models.png)

`blender/build_assets.py` builds every model procedurally. It creates the meshes, the camouflage textures (Sri Lanka Army DPM, LTTE tiger-stripe), the materials and the named joints for animation. It then saves:

- `blender/models/*.blend`, the editable Blender files. Open them in Blender to change a model.
- `public/models/*.glb`, the files the game loads.
- `public/textures/*.png`, the ground textures and normal maps, grass cards and leaf litter used by the terrain shader.

The models are: SL Army soldier, LTTE cadre, civilian, Unibuffel-style APC, Sea Tiger attack boat, sandbag bunker, sandbag wall, earth bund, house, ruined house, Kilinochchi water tower (toppled), Mavil Aru anicut, coconut palm, palmyrah palm, two rainforest trees, bush, fern, banana plant, fallen log, cadjan hut, rocks (including Thoppigala's Baron's Cap) and a supply cache.

To rebuild all models:

```bash
blender -b -P blender/build_assets.py      # with Blender 4.x/5.x installed
# or, without the Blender app:
pip install bpy && python blender/build_assets.py
```

The script only re-exports the FBX models and textures into the Unity project when `WANNI_UNITY=1` is set.

Soldiers face −Y in Blender and are made of parts named `Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR` and `Muzzle`. The game animates these parts directly, so if you edit a soldier in Blender, keep those names.

## Project layout

```
blender/build_assets.py   Blender model builder
blender/models/           editable .blend files
public/models/            exported .glb models
src/main.js               game loop, player, camera, objectives, HUD
src/missions.js           the ten missions: history text, maps, objectives
src/world.js              terrain shader, sky, water, props, grass, collision and ray casts
src/atmosphere.js         per-mission lighting, fog, weather and colour grade
src/weather.js            rain, mist, dust, smoke and lightning
src/postfx.js             MSAA, bloom, tone mapping and colour grade
src/net.js                two-player co-op over WebRTC (PeerJS)
src/units.js              soldiers and civilians: animation and AI
src/fx.js, src/audio.js   effects and procedural sound
src/input.js              keyboard, mouse and touch controls
```

## Historical sources

- [Eelam War IV](https://en.wikipedia.org/wiki/Eelam_War_IV)
- [Northern Theatre of Eelam War IV](https://en.wikipedia.org/wiki/Northern_Theatre_of_Eelam_War_IV)
- [Eastern Theatre of Eelam War IV](https://en.wikipedia.org/wiki/Eastern_Theatre_of_Eelam_War_IV)
- [Battle of Kilinochchi (2008–2009)](https://en.wikipedia.org/wiki/Battle_of_Kilinochchi_(2008%E2%80%932009))
- [58 Division (Sri Lanka)](https://en.wikipedia.org/wiki/58_Division_(Sri_Lanka))
- [List of military operations of the Sri Lankan civil war](https://en.wikipedia.org/wiki/List_of_military_operations_of_the_Sri_Lankan_civil_war)
- [Sunday Observer — "Pooneryn falls" (16 Nov 2008)](https://archives.sundayobserver.lk/2008/11/16/sec03.asp)
- [South Asia Intelligence Review (SATP)](https://satp.org/satporgtp/sair/Archives/7_30.htm)

The gameplay is fiction built around these events. Many sources from 2008–2009 are official or government-aligned, and the final months of the war are still the subject of calls for accountability. The game's text sticks to well-documented dates and places.
