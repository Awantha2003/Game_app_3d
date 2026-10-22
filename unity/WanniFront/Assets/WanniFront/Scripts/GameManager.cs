using System;
using System.Collections.Generic;
using UnityEngine;

namespace WanniFront
{
    /// <summary>Creates the game in any scene when Play is pressed.</summary>
    public static class Boot
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Start()
        {
            if (UnityEngine.Object.FindFirstObjectByType<GameManager>() == null)
                new GameObject("Wanni Front").AddComponent<GameManager>();
        }
    }

    public class Interactable
    {
        public string label;
        public float time;
        public Action complete;
    }

    /// <summary>Game flow: menus, mission setup, objectives, alarms, explosions and the HUD.</summary>
    public partial class GameManager : MonoBehaviour
    {
        public static GameManager I;

        public enum GameState { Menu, Briefing, Playing, Paused, Complete, Failed, Epilogue }
        public GameState state = GameState.Menu;
        public bool Playing => state == GameState.Playing;

        public World world;
        public Player player;
        public readonly List<Unit> units = new List<Unit>();
        public MissionDef mission;
        public int missionIndex;
        public float difficulty = 1f;
        public float combatTimer;
        public int shotsFired, shotsHit, kills;
        public bool mapOpen;

        int objIndex = -1;
        float missionTime, endTimer, shellTimer, orbit;
        Action endAction;
        int civTotal, civSafe;
        Camera mainCam, mapCam;
        readonly List<(TargetRec t, float timer)> charges = new List<(TargetRec, float)>();

        public ObjectiveDef CurrentObjective => mission != null && objIndex >= 0 && objIndex < mission.objectives.Length ? mission.objectives[objIndex] : null;
        public Vector3 EscortZone
        {
            get
            {
                foreach (var o in mission.objectives) if (o.type == ObjType.Escort) return o.zone;
                return new Vector3(0, 0, 10);
            }
        }

        // ------------------------------------------------------------ lifecycle

        void Awake()
        {
            I = this;
            DontDestroyOnLoad(gameObject);
            Library.Init();
            gameObject.AddComponent<Sfx>();
            gameObject.AddComponent<Fx>();
            mainCam = Camera.main;
            if (mainCam == null)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                mainCam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
            }
            mainCam.transform.SetParent(null);
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None))
                if (l.type == LightType.Directional) l.gameObject.SetActive(false);
            difficulty = PlayerPrefs.GetFloat("wf_difficulty", 1f);
            GameInput.MouseSensitivity = PlayerPrefs.GetFloat("wf_sens", 2f);
        }

        void Start()
        {
            StartMission(Mathf.Min(Unlocked, Missions.All.Length - 1));
            state = GameState.Menu;
        }

        public int Unlocked
        {
            get => PlayerPrefs.GetInt("wf_unlocked", 0);
            set { PlayerPrefs.SetInt("wf_unlocked", value); PlayerPrefs.Save(); }
        }

        public bool Done(string id) => PlayerPrefs.GetInt("wf_done_" + id, 0) == 1;

        // ------------------------------------------------------------ mission setup

        void Cleanup()
        {
            foreach (var u in units) if (u != null) Destroy(u.gameObject);
            units.Clear();
            if (player != null)
            {
                mainCam.transform.SetParent(null);
                for (int i = mainCam.transform.childCount - 1; i >= 0; i--) Destroy(mainCam.transform.GetChild(i).gameObject);
                Destroy(player.gameObject);
                player = null;
            }
            foreach (var g in FindObjectsByType<Grenade>(FindObjectsSortMode.None)) Destroy(g.gameObject);
            if (world != null) Destroy(world.gameObject);
            if (mapCam != null) mapCam.enabled = false;
            mapOpen = false;
            Fx.I.Clear();
            Sfx.I.StopAll();
            charges.Clear();
            toasts.Clear();
            feed.Clear();
        }

        public void StartMission(int i)
        {
            Cleanup();
            missionIndex = i;
            mission = Missions.All[i];
            world = World.Build(mission, 1000 + i * 77);
            var start = new Vector3(mission.playerStart.x, 0, mission.playerStart.y);
            start.y = world.GroundY(start);
            mainCam.fieldOfView = 70;
            player = Player.Create(start, mission.playerYaw, mainCam);
            for (int k = 0; k < mission.allies; k++)
            {
                var p = start + new Vector3(k % 2 == 1 ? 3 : -3, 0, 4 + k * 2);
                p.y = world.GroundY(p);
                units.Add(Unit.Create(Team.Army, p, mission.playerYaw, "squad", k));
            }
            int idx = 10;
            foreach (var s in world.spawns)
                units.Add(Unit.Create(s.team, s.pos, s.yaw, s.tag, idx++, s.patrol, s.sentry));
            civTotal = 0;
            foreach (var u in units) if (u.team == Team.Civilian) civTotal++;
            civSafe = 0;
            objIndex = -1;
            failReason = null;
            shotsFired = shotsHit = kills = 0;
            missionTime = endTimer = combatTimer = 0;
            shellTimer = 8;
            Sfx.I.SetAmbience(mission.jungleSounds, mission.rain);
            state = GameState.Briefing;
        }

        public void Begin()
        {
            state = GameState.Playing;
            Toast(mission.name.ToUpper() + " — " + mission.date, true);
            ActivateObjective(0);
        }

        void SetCursor(bool locked)
        {
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        // ------------------------------------------------------------ update

        void Update()
        {
            float dt = Time.deltaTime;
            SetCursor(state == GameState.Playing && !mapOpen);
            UpdateFeeds(dt);
            if (state == GameState.Playing)
            {
                missionTime += dt;
                combatTimer = Mathf.Max(0, combatTimer - dt);
                if (GameInput.KeyDown(KeyCode.Escape) || GameInput.KeyDown(KeyCode.P)) { state = GameState.Paused; Time.timeScale = 0; return; }
                if (GameInput.KeyDown(KeyCode.M)) ToggleMap();
                for (int i = charges.Count - 1; i >= 0; i--)
                {
                    var (t, timer) = charges[i];
                    timer -= dt;
                    if (timer <= 0) { charges.RemoveAt(i); Detonate(t); }
                    else charges[i] = (t, timer);
                }
                Shelling(dt);
                CheckObjective();
                if (endTimer > 0)
                {
                    endTimer -= dt;
                    if (endTimer <= 0) endAction?.Invoke();
                }
            }
            else if (state == GameState.Paused)
            {
                if (GameInput.KeyDown(KeyCode.Escape)) Resume();
            }
            else if (player != null && state != GameState.Paused)
            {
                // slow orbit behind the menus
                orbit += dt * 0.05f;
                var p = player.Position;
                mainCam.transform.position = p + new Vector3(Mathf.Sin(orbit) * 24, 10, Mathf.Cos(orbit) * 24);
                mainCam.transform.LookAt(p + Vector3.up * 2);
            }
        }

        public void Resume()
        {
            Time.timeScale = 1;
            state = GameState.Playing;
        }

        void ToggleMap()
        {
            mapOpen = !mapOpen;
            if (mapCam == null)
            {
                var go = new GameObject("MapCamera");
                go.transform.SetParent(transform);
                mapCam = go.AddComponent<Camera>();
                mapCam.orthographic = true;
                mapCam.depth = 50;
                mapCam.cullingMask = ~(1 << Library.ViewModelLayer);
                mapCam.clearFlags = CameraClearFlags.SolidColor;
                mapCam.backgroundColor = new Color(0.1f, 0.12f, 0.08f);
                mapCam.farClipPlane = 1000;
            }
            mapCam.orthographicSize = mission.size * 1.05f;
            mapCam.transform.position = new Vector3(0, 400, 0);
            mapCam.transform.rotation = Quaternion.Euler(90, 180, 0); // north (-Z) at the top
            mapCam.enabled = mapOpen;
            Sfx.I.Play2D(Sfx.I.click, 0.4f);
        }

        void Shelling(float dt)
        {
            if (!mission.shelling) return;
            shellTimer -= dt;
            if (shellTimer > 0) return;
            shellTimer = 6 + UnityEngine.Random.value * 10;
            float a = UnityEngine.Random.value * Mathf.PI * 2, r = 50 + UnityEngine.Random.value * 70;
            var pos = player.Position + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r);
            pos.y = world.GroundY(pos);
            Fx.I.Explosion(pos, UnityEngine.Random.value < 0.5f ? 1f : 0.6f);
            Sfx.I.Play3D(Sfx.I.explosion, pos, 1f, 20, 800);
            Fx.I.Shake = Mathf.Max(Fx.I.Shake, 0.3f - r / 500f);
        }

        // ------------------------------------------------------------ objectives

        void ActivateObjective(int i)
        {
            objIndex = i;
            var o = CurrentObjective;
            if (o == null) return;
            if (o.spawn != null)
                foreach (var s in o.spawn)
                    for (int k = 0; k < s.n; k++)
                    {
                        var p = new Vector3(s.x + UnityEngine.Random.Range(-5f, 5f), 0, s.z + UnityEngine.Random.Range(-5f, 5f));
                        if (world.IsWater(p.x, p.z, 0)) continue;
                        p.y = world.GroundY(p);
                        var u = Unit.Create(Team.LTTE, p, 0, s.tag, 50 + k);
                        units.Add(u);
                        u.EnterCombat(player);
                    }
            if (i > 0) Toast("New objective: " + o.text);
        }

        public bool IsLaterGroup(string tag)
        {
            if (mission == null) return false;
            for (int i = 0; i <= objIndex && i < mission.objectives.Length; i++)
                if (mission.objectives[i].tag == tag) return false;
            for (int i = objIndex + 1; i < mission.objectives.Length; i++)
                if (mission.objectives[i].tag == tag) return true;
            return false;
        }

        public string ObjectiveSub { get; private set; }

        void CheckObjective()
        {
            var o = CurrentObjective;
            if (o == null || endTimer > 0) return;
            bool done = false;
            ObjectiveSub = "";
            switch (o.type)
            {
                case ObjType.Reach:
                    done = Vector2.Distance(new Vector2(player.Position.x, player.Position.z), o.pos) < o.r;
                    break;
                case ObjType.Clear:
                    int left = 0;
                    foreach (var u in units) if (u.Alive && u.team == Team.LTTE && u.groupTag == o.tag) left++;
                    ObjectiveSub = "Hostiles remaining: " + left;
                    done = left == 0;
                    if (left <= 2)
                        foreach (var u in units)
                            if (u.Alive && u.team == Team.LTTE && u.groupTag == o.tag && u.state == Unit.State.Idle && !u.sentry)
                            { u.state = Unit.State.Search; u.Hear(player.Position, 1000, true); }
                    break;
                case ObjType.Interact:
                    int n = 0, total = 0;
                    done = true;
                    foreach (var t in world.targets)
                    {
                        if (t.tag != o.tag) continue;
                        total++;
                        if (t.done) n++;
                        if (!t.done || t.pending) done = false;
                    }
                    ObjectiveSub = total > 1 ? n + " / " + total : "";
                    break;
                case ObjType.DisableAlarm:
                    done = true;
                    foreach (var a in world.alarms)
                        if (a.tag == o.tag && !a.disabled)
                        {
                            done = false;
                            if (a.triggered) { done = true; Toast("The alarm was raised — fight your way through!"); }
                        }
                    break;
                case ObjType.Escort:
                    int waiting = 0;
                    foreach (var u in units) if (u.team == Team.Civilian && u.state == Unit.State.CivWait) waiting++;
                    ObjectiveSub = waiting > 0 ? "Reach the civilians (" + waiting + " waiting)" : "Civilians safe: " + civSafe + " / " + civTotal;
                    done = civTotal > 0 && civSafe >= civTotal;
                    break;
            }
            if (!done) return;
            Toast("Objective complete", true);
            if (objIndex + 1 < mission.objectives.Length) ActivateObjective(objIndex + 1);
            else MissionComplete();
        }

        public Vector3? ObjectiveWaypoint()
        {
            var o = CurrentObjective;
            if (o == null || player == null) return null;
            var p = player.Position;
            switch (o.type)
            {
                case ObjType.Reach:
                    var r = new Vector3(o.pos.x, 0, o.pos.y);
                    r.y = world.GroundY(r) + 1.5f;
                    return r;
                case ObjType.Clear:
                    Unit best = null;
                    int count = 0;
                    foreach (var u in units)
                        if (u.Alive && u.team == Team.LTTE && u.groupTag == o.tag)
                        {
                            count++;
                            if (best == null || Vector3.Distance(u.Position, p) < Vector3.Distance(best.Position, p)) best = u;
                        }
                    if (best == null || (count > 2 && Vector3.Distance(best.Position, p) < 30)) return null;
                    return best.Position + Vector3.up * 2;
                case ObjType.Interact:
                    TargetRec bt = null;
                    foreach (var t in world.targets)
                        if (t.tag == o.tag && !t.done && (bt == null || Vector3.Distance(t.pos, p) < Vector3.Distance(bt.pos, p))) bt = t;
                    return bt != null ? bt.pos + Vector3.up * 1.5f : (Vector3?)null;
                case ObjType.DisableAlarm:
                    foreach (var a in world.alarms) if (a.tag == o.tag && !a.disabled) return a.pos + Vector3.up * 2;
                    return null;
                case ObjType.Escort:
                    foreach (var u in units) if (u.team == Team.Civilian && u.state == Unit.State.CivWait) return u.Position + Vector3.up * 2;
                    var z = new Vector3(o.zone.x, 0, o.zone.y);
                    z.y = world.GroundY(z) + 2;
                    return z;
            }
            return null;
        }

        void MissionComplete()
        {
            endTimer = 2.5f;
            endAction = () =>
            {
                PlayerPrefs.SetInt("wf_done_" + mission.id, 1);
                Unlocked = Mathf.Max(Unlocked, Mathf.Min(Missions.All.Length - 1, missionIndex + 1));
                state = GameState.Complete;
                mapOpen = false;
                if (mapCam != null) mapCam.enabled = false;
            };
        }

        public void MissionFailed(string reason)
        {
            if (endTimer > 0 && state == GameState.Playing && failReason != null) return;
            failReason = reason;
            endTimer = 2f;
            endAction = () =>
            {
                state = GameState.Failed;
                mapOpen = false;
                if (mapCam != null) mapCam.enabled = false;
            };
        }

        string failReason;

        // ------------------------------------------------------------ events

        public void OnUnitKilled(Unit u)
        {
            if (u.team == Team.Civilian) { MissionFailed("A civilian was killed. Protecting civilians is your first duty."); return; }
            if (u.team == Team.LTTE)
            {
                if (u.killedByPlayer) kills++;
                Feed(u.killedByPlayer ? "LTTE cadre neutralised" : "LTTE cadre neutralised by squad");
                foreach (var a in world.alarms) if (a.runner == u) a.runner = null;
            }
        }

        public void OnCivilianSafe(Unit u)
        {
            civSafe++;
            Toast("Civilian reached safety (" + civSafe + "/" + civTotal + ")");
        }

        public void OnEnemyAlerted(Unit u)
        {
            combatTimer = 10;
            // the first alerted cadre near a working alarm runs for it
            AlarmRec best = null;
            foreach (var a in world.alarms)
            {
                if (a.disabled || a.triggered || (a.runner != null && a.runner.Alive)) continue;
                float d = Vector3.Distance(a.pos, u.Position);
                if (d < 90 && (best == null || d < Vector3.Distance(best.pos, u.Position))) best = a;
            }
            if (best == null || u.sentry) return;
            best.runner = u;
            u.SendToAlarm(best.pos);
            Toast("A cadre is running for the alarm — stop him!");
        }

        public AlarmRec AlarmFor(Unit u)
        {
            foreach (var a in world.alarms) if (a.runner == u) return a;
            return null;
        }

        public void TriggerAlarm(AlarmRec a)
        {
            if (a.triggered || a.disabled) return;
            a.triggered = true;
            Sfx.I.Siren(a.pos, true);
            Toast("ALARM! Reinforcements are coming", true);
            foreach (var u in units)
                if (u.Alive && u.team == Team.LTTE) { u.Hear(player.Position, 10000, true); u.EnterCombat(player); }
            // reinforcements arrive from the far side of the alarm
            var away = (a.pos - player.Position);
            away.y = 0;
            away = away.sqrMagnitude > 0.01f ? away.normalized : Vector3.forward;
            for (int k = 0; k < 5; k++)
            {
                var p = a.pos + away * 45 + new Vector3(UnityEngine.Random.Range(-8f, 8f), 0, UnityEngine.Random.Range(-8f, 8f));
                p.x = Mathf.Clamp(p.x, -mission.size + 5, mission.size - 5);
                p.z = Mathf.Clamp(p.z, -mission.size + 5, mission.size - 5);
                if (world.IsWater(p.x, p.z, 0)) p = a.pos + new Vector3(UnityEngine.Random.Range(-6f, 6f), 0, UnityEngine.Random.Range(-6f, 6f));
                p.y = world.GroundY(p);
                var u = Unit.Create(Team.LTTE, p, 0, a.tag, 80 + k);
                units.Add(u);
                u.EnterCombat(player);
            }
        }

        public void MakeNoise(Vector3 pos, float radius, bool gunshot)
        {
            foreach (var u in units) u.Hear(pos, radius, gunshot);
        }

        public void Explode(Vector3 pos, float radius, float damage, bool byPlayer)
        {
            Fx.I.Explosion(pos);
            Sfx.I.Play3D(Sfx.I.explosion, pos, 1f, 15, 800);
            float pd = Vector3.Distance(pos, player.Position);
            Fx.I.Shake = Mathf.Max(Fx.I.Shake, 1.2f - pd / 40f);
            var from = pos + Vector3.up * 0.4f;
            foreach (var u in units)
            {
                if (!u.Alive) continue;
                float d = Vector3.Distance(u.AimPoint, from);
                if (d > radius || Physics.Linecast(from, u.AimPoint, Library.WorldMask, QueryTriggerInteraction.Ignore)) continue;
                if (byPlayer) u.killedByPlayer = true;
                u.Damage(damage * (1 - d / radius), pos, false);
            }
            if (pd < radius && !Physics.Linecast(from, player.AimPoint, Library.WorldMask, QueryTriggerInteraction.Ignore))
                player.Damage(damage * 0.6f * (1 - pd / radius), pos, false);
            MakeNoise(pos, 130, true);
        }

        void Detonate(TargetRec t)
        {
            var pos = t.obj != null ? t.obj.transform.position : t.pos;
            if (t.obj != null) Destroy(t.obj);
            Explode(pos, 7, 200, true);
            t.pending = false;
            Feed("Sea Tiger boat destroyed");
        }

        // ------------------------------------------------------------ interaction

        public Interactable FindInteractable(Vector3 pos)
        {
            var o = CurrentObjective;
            if (o != null && o.type == ObjType.Interact)
                foreach (var t in world.targets)
                {
                    if (t.tag != o.tag || t.done) continue;
                    if (Flat(t.pos - pos) > (t.obj != null ? 7f : 3.5f)) continue;
                    var tt = t;
                    return new Interactable
                    {
                        label = "Hold E — " + (t.plant ? "plant charge on " : "operate ") + t.label,
                        time = t.time,
                        complete = () =>
                        {
                            tt.done = true;
                            if (tt.plant) { tt.pending = true; charges.Add((tt, 4f)); Toast("Charge set — move away! (4 s)"); }
                            else Toast("The sluice gates are open — water is flowing to the paddy fields again", true);
                        },
                    };
                }
            foreach (var a in world.alarms)
            {
                if (a.disabled || Flat(a.pos - pos) > 2.5f) continue;
                var aa = a;
                return new Interactable
                {
                    label = "Hold E — sabotage the alarm",
                    time = 3,
                    complete = () => { aa.disabled = true; Sfx.I.Siren(aa.pos, false); Toast("Alarm sabotaged"); },
                };
            }
            foreach (var s in world.supplies)
                if (Flat(s - pos) < 3f)
                    return new Interactable { label = "E — resupply ammunition, grenades and dressings", time = 0, complete = () => { player.Resupply(); Toast("Resupplied"); } };
            foreach (var tw in world.towers)
            {
                float d = Flat(tw - pos);
                if (pos.y < tw.y + 2 && d < 2.8f)
                {
                    var top = tw + Vector3.up * 5.2f;
                    return new Interactable { label = "Hold E — climb the tower", time = 0.8f, complete = () => player.Teleport(top) };
                }
                if (pos.y > tw.y + 4 && d < 2.2f)
                {
                    var down = tw + new Vector3(2.6f, 0, 0);
                    down.y = world.GroundY(down) + 0.1f;
                    return new Interactable { label = "Hold E — climb down", time = 0.8f, complete = () => player.Teleport(down) };
                }
            }
            return null;
        }

        static float Flat(Vector3 v) => new Vector2(v.x, v.z).magnitude;
    }
}
