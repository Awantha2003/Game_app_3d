# Wanni Front: Unity version

This is the first-person Unity version of Wanni Front. It plays like *Project IGI*: you infiltrate quietly, mark sentries with binoculars, sabotage alarms, use a sniper rifle, and check the tactical map. The campaign is the same six real operations from Eelam War IV (2006–2009).

## Open the project

1. Install **Unity Hub**, then install **Unity 6 LTS (6000.0.x)**. Unity 2022.3 LTS also works.
2. In Unity Hub, choose **Add → Add project from disk** and select this folder (`unity/WanniFront`).
3. Open the project. The first import takes a few minutes. When it finishes, the `Wanni Front` setup runs by itself. It:
   - switches the project to Linear colour space,
   - re-imports the Blender models with Read/Write enabled and the terrain normal maps,
   - adds the shaders the game needs to *Always Included Shaders*,
   - creates `Assets/WanniFront/WanniFront.unity` and adds it to the build settings.

   If you need to run it again, use the menu **Wanni Front → Run Project Setup**.
4. Open `Assets/WanniFront/WanniFront.unity` and press **Play**.

The game bootstraps itself from code, so it also runs from any empty scene. A build (**File → Build Profiles / Build Settings → Build**) gives you a Windows `.exe`.

> Unity 6 may ask whether to enable the new Input System. Either answer is fine. `GameInput.cs` supports both the old and the new input backends.

## Controls

| Key | Action |
|---|---|
| WASD / Mouse | Move / look |
| Left mouse | Fire |
| Right mouse | Aim down sights (scope on the SVD) |
| Shift | Sprint. When scoped, hold your breath to steady the rifle |
| C / Z / Space | Crouch / prone / stand or jump |
| 1 2 3, mouse wheel | T-56 rifle, suppressed pistol, SVD sniper |
| G | Throw grenade |
| B | Binoculars. Look at a hostile to mark them on the HUD and the map |
| M | Tactical map |
| E | Interact: sabotage alarms, plant charges, climb towers, resupply |
| H | Field dressing (+50 health) |
| R | Reload |
| Esc | Pause |

## What's in it

- **Stealth AI.** Each LTTE cadre has a vision cone and a detection meter. The meter fills faster when you stand, move or sprint, and slower when you crouch or go prone. The yellow-to-red bars around the crosshair show who is noticing you. Cadres also hear footsteps and gunshots. The suppressed pistol carries about 9 m, the rifle about 90 m.
- **Alarms.** When a camp is alerted, one cadre runs for the siren. If he reaches it, the whole area is alerted and reinforcements arrive. Sabotage the alarm first (hold E), or stop the runner.
- **Watchtowers.** Sentries in towers have long sightlines. You can climb a tower (E at its base) for an overwatch position.
- **Weapons.** T-56 assault rifle, suppressed pistol, SVD sniper (scope sway, hold breath) and grenades with physics. Recoil, spread, stance accuracy and headshots are all modelled.
- **World.** Unity Terrain with painted ground textures and normal maps, waving grass, water, a procedural sky, soft shadows and fog. Each mission has its own time of day: dawn mist at Thoppigala, dusk at Pooneryn, monsoon rain at Kilinochchi. Distant artillery is also part of the scenery.
- **Sound.** All sound is synthesised at start-up: gunshots, explosions, siren, rain, jungle insects and birds, footsteps.
- **Squad.** Allies follow you in assault missions. They hold fire until the fight starts, so they don't ruin a stealthy approach. Thoppigala is a solo Special Forces infiltration.

## How the code is organised

```
Assets/WanniFront/
  Resources/Models/*.fbx      models exported from Blender (blender/build_assets.py)
  Resources/Textures/*.png    textures and terrain layers from the same script
  Resources/materials.json    material colours/roughness/textures per model
  Scripts/GameManager.cs      game flow, objectives, alarms, explosions, interaction
  Scripts/Hud.cs              HUD, tactical map, menus (IMGUI)
  Scripts/Player.cs           first-person controller, stances, weapons, binoculars, grenades
  Scripts/Unit.cs             AI: perception, stealth detection, combat, allies, civilians
  Scripts/World.cs            terrain, grass, water, sky, rain, props, spawn points
  Scripts/Missions.cs         the six missions: history, terrain shape, layout, objectives
  Scripts/Library.cs          loads models, builds materials, fixes FBX axes, adds colliders
  Scripts/Fx.cs, Sfx.cs       particles/tracers and procedural audio
  Editor/WanniFrontSetup.cs   import settings and one-time project setup
```

## Making it look more real

The Blender models are simple and procedural. The code makes them easy to replace:

- **Characters:** download a rigged soldier with animations from [Mixamo](https://www.mixamo.com) as FBX. Replace `Resources/Models/soldier_army.fbx` or `soldier_ltte.fbx`, or ask Claude to wire in an Animator. The game expects child objects named `Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR` and `Muzzle`.
- **Props and weapons:** any FBX with the same file name in `Resources/Models` replaces the Blender one.
- **Ground textures:** replace `Resources/Textures/ground_*.png`, for example with photo-scanned textures from Poly Haven.
- **Post-processing:** add the *Post Processing* package, or switch to URP, for bloom, ambient occlusion and colour grading.

To rebuild the Blender assets: `python blender/build_assets.py` (needs `pip install bpy`) or `blender -b -P blender/build_assets.py`.
