using System.Collections.Generic;
using UnityEngine;

namespace WanniFront
{
    /// <summary>HUD, tactical map overlay and all menus (IMGUI, no UI assets needed).</summary>
    public partial class GameManager
    {
        readonly List<(string text, float t, bool big)> toasts = new List<(string, float, bool)>();
        readonly List<(string text, float t)> feed = new List<(string, float)>();

        static readonly Color Accent = new Color(0.88f, 0.72f, 0.29f);
        static readonly Color Panel = new Color(0.07f, 0.08f, 0.05f, 0.88f);
        static readonly Color Muted = new Color(0.73f, 0.7f, 0.61f);
        static readonly Color Danger = new Color(0.88f, 0.34f, 0.23f);

        Texture2D white, scopeTex, ringTex;
        Font sinhala;
        GUIStyle h1, h2, body, small, label, eyebrow, btn, si, center;
        Vector2 scroll;
        float uiScale = 1;

        public void Toast(string text, bool big = false)
        {
            toasts.Add((text, 3.5f, big));
            if (toasts.Count > 5) toasts.RemoveAt(0);
        }

        void Feed(string text)
        {
            feed.Add((text, 4f));
            if (feed.Count > 5) feed.RemoveAt(0);
        }

        void UpdateFeeds(float dt)
        {
            for (int i = toasts.Count - 1; i >= 0; i--)
            {
                var (s, t, b) = toasts[i];
                t -= Time.unscaledDeltaTime;
                if (t <= 0) toasts.RemoveAt(i); else toasts[i] = (s, t, b);
            }
            for (int i = feed.Count - 1; i >= 0; i--)
            {
                var (s, t) = feed[i];
                t -= Time.unscaledDeltaTime;
                if (t <= 0) feed.RemoveAt(i); else feed[i] = (s, t);
            }
        }

        // ------------------------------------------------------------ styles

        void Styles()
        {
            if (white != null) return;
            white = Texture2D.whiteTexture;
            scopeTex = MakeScope(512, 0.48f);
            ringTex = MakeScope(256, 0.46f);
            sinhala = Font.CreateDynamicFontFromOSFont(new[] { "Nirmala UI", "Iskoola Pota", "Noto Sans Sinhala", "Noto Sans Sinhala UI", "Sinhala Sangam MN" }, 22);
            h1 = new GUIStyle(GUI.skin.label) { fontSize = 64, fontStyle = FontStyle.Bold, normal = { textColor = Accent } };
            h2 = new GUIStyle(GUI.skin.label) { fontSize = 34, fontStyle = FontStyle.Bold, normal = { textColor = Color.white }, wordWrap = true };
            body = new GUIStyle(GUI.skin.label) { fontSize = 17, wordWrap = true, normal = { textColor = new Color(0.95f, 0.93f, 0.87f) } };
            small = new GUIStyle(body) { fontSize = 14, normal = { textColor = Muted } };
            label = new GUIStyle(GUI.skin.label) { fontSize = 18, normal = { textColor = Color.white } };
            eyebrow = new GUIStyle(GUI.skin.label) { fontSize = 14, fontStyle = FontStyle.Bold, normal = { textColor = Accent } };
            center = new GUIStyle(label) { alignment = TextAnchor.MiddleCenter, wordWrap = true };
            si = new GUIStyle(GUI.skin.label) { font = sinhala, fontSize = 22, normal = { textColor = Muted } };
            btn = new GUIStyle(GUI.skin.button) { fontSize = 18, fontStyle = FontStyle.Bold, padding = new RectOffset(14, 14, 10, 10) };
        }

        static Texture2D MakeScope(int n, float radius)
        {
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            float c = n / 2f;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float d = Vector2.Distance(new Vector2(x, y), new Vector2(c, c)) / n;
                float a = Mathf.Clamp01((d - radius) * n * 0.25f);
                t.SetPixel(x, y, new Color(0, 0, 0, a));
            }
            t.Apply();
            return t;
        }

        void Rect(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, white);
            GUI.color = old;
        }

        void Text(Rect r, string s, GUIStyle st, Color? c = null)
        {
            var old = st.normal.textColor;
            if (c.HasValue) st.normal.textColor = c.Value;
            var sh = new Rect(r.x + 1, r.y + 1, r.width, r.height);
            var oc = st.normal.textColor;
            st.normal.textColor = new Color(0, 0, 0, 0.7f * oc.a);
            GUI.Label(sh, s, st);
            st.normal.textColor = oc;
            GUI.Label(r, s, st);
            st.normal.textColor = old;
        }

        // ------------------------------------------------------------ OnGUI

        void OnGUI()
        {
            Styles();
            uiScale = Mathf.Clamp(Screen.height / 900f, 0.7f, 2f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1));
            float W = Screen.width / uiScale, H = Screen.height / uiScale;

            switch (state)
            {
                case GameState.Playing:
                    if (mapOpen) DrawMap(W, H); else DrawHud(W, H);
                    DrawToasts(W, H);
                    break;
                case GameState.Paused: DrawHud(W, H); PausePanel(W, H); break;
                case GameState.Menu: MenuPanel(W, H); break;
                case GameState.Briefing: BriefingPanel(W, H); break;
                case GameState.Complete: CompletePanel(W, H); break;
                case GameState.Failed: FailedPanel(W, H); break;
                case GameState.Epilogue: EpiloguePanel(W, H); break;
            }
        }

        Vector2? ToScreen(Camera c, Vector3 world, float W, float H)
        {
            var s = c.WorldToScreenPoint(world);
            if (s.z < 0) return null;
            return new Vector2(s.x / uiScale, H - s.y / uiScale);
        }

        void DrawHud(float W, float H)
        {
            if (player == null) return;
            var p = player;

            // low health and damage tint
            float hurt = Mathf.Max(p.damageT * 0.35f, p.hp < 40 ? (1 - p.hp / 40f) * 0.35f : 0);
            if (hurt > 0) Rect(new Rect(0, 0, W, H), new Color(0.6f, 0.05f, 0.02f, hurt));

            // scope / binoculars
            if (p.Scoped || p.binoculars)
            {
                float s = H;
                var r = new Rect((W - s) / 2, 0, s, s);
                Rect(new Rect(0, 0, r.x + 1, H), Color.black);
                Rect(new Rect(r.xMax - 1, 0, W - r.xMax + 1, H), Color.black);
                GUI.DrawTexture(r, p.binoculars ? ringTex : scopeTex);
                if (p.Scoped)
                {
                    Rect(new Rect(W / 2 - s * 0.45f, H / 2, s * 0.9f, 1.5f), new Color(0, 0, 0, 0.9f));
                    Rect(new Rect(W / 2, H / 2 - s * 0.45f, 1.5f, s * 0.9f), new Color(0, 0, 0, 0.9f));
                    for (int i = 1; i <= 4; i++) Rect(new Rect(W / 2 - 6, H / 2 + i * 18, 12, 1.5f), new Color(0, 0, 0, 0.9f));
                    Rect(new Rect(W / 2 - 60, H - 60, 120 * p.breath, 4), new Color(1, 1, 1, 0.6f));
                    Text(new Rect(W / 2 - 120, H - 85, 240, 22), "Hold SHIFT to steady", new GUIStyle(small) { alignment = TextAnchor.MiddleCenter });
                }
                else
                {
                    string range = "---";
                    var cam = p.cam.transform;
                    if (Physics.Raycast(cam.position, cam.forward, out var hit, 1000, Library.ShotMask, QueryTriggerInteraction.Ignore)) range = Mathf.RoundToInt(hit.distance) + " m";
                    Text(new Rect(W / 2 - 150, H - 90, 300, 24), "RANGE  " + range, new GUIStyle(label) { alignment = TextAnchor.MiddleCenter, normal = { textColor = Accent } });
                    Text(new Rect(W / 2 - 200, H - 64, 400, 22), "Look at hostiles to mark them · B to lower", new GUIStyle(small) { alignment = TextAnchor.MiddleCenter });
                    Rect(new Rect(W / 2 - 15, H / 2, 30, 1), new Color(1, 1, 1, 0.6f));
                    Rect(new Rect(W / 2, H / 2 - 15, 1, 30), new Color(1, 1, 1, 0.6f));
                }
            }
            else if (p.aimK < 0.5f)
            {
                float gap = 6 + (p.W.spreadHip + (p.Speed > 0.5f ? 1.5f : 0)) * 4 * (p.CurrentStance == Player.Stance.Prone ? 0.5f : 1);
                var c = new Color(1, 1, 1, 0.85f);
                Rect(new Rect(W / 2 - 1, H / 2 - gap - 9, 2, 9), c);
                Rect(new Rect(W / 2 - 1, H / 2 + gap, 2, 9), c);
                Rect(new Rect(W / 2 - gap - 9, H / 2 - 1, 9, 2), c);
                Rect(new Rect(W / 2 + gap, H / 2 - 1, 9, 2), c);
            }
            if (p.hitMarkerT > 0)
            {
                var c = p.hitMarkerKill ? Danger : Color.white;
                for (int k = 0; k < 4; k++)
                {
                    GUIUtility.RotateAroundPivot(45 + k * 90, new Vector2(W / 2, H / 2) * uiScale);
                    Rect(new Rect(W / 2 - 1, H / 2 - 14, 2, 7), c);
                    GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1));
                }
            }

            DetectionIndicators(W, H);
            Markers(W, H);

            // objective
            var o = CurrentObjective;
            Text(new Rect(16, 12, 520, 20), (mission.name + " · OBJECTIVE " + (objIndex + 1) + "/" + mission.objectives.Length).ToUpper(), eyebrow);
            if (o != null) Text(new Rect(16, 32, 520, 28), o.text, label);
            Text(new Rect(16, 58, 520, 22), ObjectiveSub, small);

            Compass(W);

            // alarm banner
            foreach (var a in world.alarms)
                if (a.triggered && !a.disabled && Mathf.Repeat(Time.time, 1) < 0.6f)
                {
                    Text(new Rect(W / 2 - 150, 70, 300, 30), "⚠ ALARM ⚠", new GUIStyle(h2) { fontSize = 24, alignment = TextAnchor.MiddleCenter }, Danger);
                    break;
                }

            // interaction prompt
            if (!string.IsNullOrEmpty(p.prompt))
            {
                Text(new Rect(W / 2 - 250, H * 0.62f, 500, 26), p.prompt, center);
                if (p.interactProgress > 0)
                {
                    Rect(new Rect(W / 2 - 100, H * 0.62f + 30, 200, 5), new Color(1, 1, 1, 0.25f));
                    Rect(new Rect(W / 2 - 100, H * 0.62f + 30, 200 * p.interactProgress, 5), Accent);
                }
            }

            // health, stance, squad
            Text(new Rect(16, H - 84, 200, 18), "HEALTH", small);
            Rect(new Rect(16, H - 64, 260, 10), new Color(0, 0, 0, 0.5f));
            Rect(new Rect(16, H - 64, 260 * Mathf.Clamp01(p.hp / 100), 10), p.hp < 35 ? Danger : new Color(0.79f, 0.83f, 0.42f));
            string stance = p.CurrentStance == Player.Stance.Stand ? "STANDING" : p.CurrentStance == Player.Stance.Crouch ? "CROUCHED" : "PRONE";
            Text(new Rect(16, H - 48, 400, 22), stance + "   ·   Dressings " + p.medkits + " (H)", small);
            float sy = H - 110;
            foreach (var u in units)
                if (u.team == Team.Army && u.groupTag == "squad")
                {
                    Text(new Rect(16, sy, 300, 20), u.displayName + (u.hp < 60 ? " · wounded" : ""), small);
                    sy -= 18;
                }

            // weapon
            var w = p.W;
            var big = new GUIStyle(h2) { fontSize = 40, alignment = TextAnchor.LowerRight };
            Text(new Rect(W - 316, H - 76, 200, 50), p.Reloading ? "··" : w.mag.ToString(), big, w.mag <= w.magSize / 5 ? Danger : (Color?)null);
            Text(new Rect(W - 112, H - 62, 100, 30), "/ " + w.reserve, new GUIStyle(label) { normal = { textColor = Muted } });
            Text(new Rect(W - 416, H - 28, 400, 20), w.name.ToUpper() + "   ·   GRENADES " + p.grenades, new GUIStyle(small) { alignment = TextAnchor.MiddleRight });

            // kill feed
            float fy = 14;
            foreach (var (s, _) in feed) { Text(new Rect(W - 420, fy, 404, 20), s, new GUIStyle(small) { alignment = TextAnchor.MiddleRight }); fy += 20; }

            // damage direction
            if (p.damageT > 0.2f)
            {
                var to = p.damageFrom - p.Position;
                float ang = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg - p.cam.transform.eulerAngles.y;
                GUIUtility.RotateAroundPivot(ang, new Vector2(W / 2, H / 2) * uiScale);
                Rect(new Rect(W / 2 - 40, H / 2 - 150, 80, 6), new Color(0.9f, 0.1f, 0.05f, p.damageT));
                GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1));
            }
        }

        void DetectionIndicators(float W, float H)
        {
            float camYaw = player.cam.transform.eulerAngles.y;
            foreach (var u in units)
            {
                if (!u.Alive || u.team != Team.LTTE || u.detection < 0.08f) continue;
                if (u.state == Unit.State.Combat && Vector3.Distance(u.Position, player.Position) > 80) continue;
                var to = u.Position - player.Position;
                float ang = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg - camYaw;
                var c = u.state == Unit.State.Combat || u.state == Unit.State.RunToAlarm ? Danger : Color.Lerp(new Color(1, 0.9f, 0.3f, 0.6f), Danger, u.detection);
                GUIUtility.RotateAroundPivot(ang, new Vector2(W / 2, H / 2) * uiScale);
                Rect(new Rect(W / 2 - 18, H / 2 - 100, 36 * Mathf.Clamp01(u.detection) + 2, 5), c);
                GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1));
            }
        }

        void Markers(float W, float H)
        {
            var cam = player.cam;
            var mk = new GUIStyle(center) { fontSize = 14 };
            foreach (var u in units)
            {
                if (!u.Alive || u.team != Team.LTTE || !u.marked) continue;
                var s = ToScreen(cam, u.Position + Vector3.up * 2.1f, W, H);
                if (s == null) continue;
                Text(new Rect(s.Value.x - 20, s.Value.y - 12, 40, 24), "◆", mk, Danger);
            }
            var wp = ObjectiveWaypoint();
            if (wp != null)
            {
                var s = ToScreen(cam, wp.Value, W, H);
                if (s != null)
                {
                    float x = Mathf.Clamp(s.Value.x, 30, W - 30), y = Mathf.Clamp(s.Value.y, 90, H - 90);
                    Text(new Rect(x - 20, y - 14, 40, 26), "◇", new GUIStyle(mk) { fontSize = 22 }, Accent);
                    Text(new Rect(x - 40, y + 10, 80, 18), Mathf.RoundToInt(Vector3.Distance(wp.Value, player.Position)) + " m", mk, Accent);
                }
            }
        }

        void Compass(float W)
        {
            float w = 340, x0 = W / 2 - w / 2;
            Rect(new Rect(x0, 12, w, 24), new Color(0, 0, 0, 0.25f));
            // heading clockwise from north; north is -Z
            float heading = Mathf.Repeat(player.cam.transform.eulerAngles.y + 180, 360);
            string[] names = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
            for (int a = 0; a < 360; a += 15)
            {
                float diff = Mathf.DeltaAngle(heading, a);
                if (Mathf.Abs(diff) > 55) continue;
                float x = W / 2 + diff * 3;
                bool major = a % 45 == 0;
                Text(new Rect(x - 20, major ? 13 : 16, 40, 20), major ? names[a / 45] : a.ToString(),
                    new GUIStyle(small) { alignment = TextAnchor.MiddleCenter, fontSize = major ? 16 : 11 }, major ? Color.white : Muted);
            }
            var wp = ObjectiveWaypoint();
            if (wp != null)
            {
                var to = wp.Value - player.Position;
                float a = Mathf.Repeat(Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg + 180, 360);
                float diff = Mathf.Clamp(Mathf.DeltaAngle(heading, a), -55, 55);
                Text(new Rect(W / 2 + diff * 3 - 10, 30, 20, 16), "▲", new GUIStyle(small) { alignment = TextAnchor.MiddleCenter, fontSize = 12 }, Accent);
            }
            Rect(new Rect(W / 2 - 1, 34, 2, 6), Accent);
        }

        void DrawMap(float W, float H)
        {
            Text(new Rect(16, 12, 600, 30), "TACTICAL MAP — " + mission.name.ToUpper(), new GUIStyle(h2) { fontSize = 24 });
            Text(new Rect(16, 44, 700, 22), (CurrentObjective != null ? "Objective: " + CurrentObjective.text : ""), small);
            Text(new Rect(16, H - 30, 900, 22), "◆ you   ● squad   ◆ marked hostile   ⚑ alarm   ▲ tower   ✚ supplies   ◇ objective      M to close", small);
            var mk = new GUIStyle(center) { fontSize = 16 };
            void Icon(Vector3 pos, string s, Color c)
            {
                var sp = ToScreen(mapCam, pos, W, H);
                if (sp != null) Text(new Rect(sp.Value.x - 15, sp.Value.y - 12, 30, 24), s, mk, c);
            }
            foreach (var a in world.alarms) Icon(a.pos, "⚑", a.disabled ? Muted : Danger);
            foreach (var t in world.towers) Icon(t, "▲", Muted);
            foreach (var s in world.supplies) Icon(s, "✚", new Color(0.6f, 0.9f, 0.5f));
            foreach (var u in units)
            {
                if (!u.Alive) continue;
                if (u.team == Team.Army) Icon(u.Position, "●", new Color(0.5f, 0.85f, 0.4f));
                else if (u.team == Team.LTTE && u.marked) Icon(u.Position, "◆", Danger);
                else if (u.team == Team.Civilian) Icon(u.Position, "●", new Color(0.6f, 0.75f, 1f));
            }
            var wp = ObjectiveWaypoint();
            if (wp != null) Icon(wp.Value, "◇", Accent);
            var pp = ToScreen(mapCam, player.Position, W, H);
            if (pp != null)
            {
                GUIUtility.RotateAroundPivot(player.cam.transform.eulerAngles.y + 180, pp.Value * uiScale);
                Text(new Rect(pp.Value.x - 12, pp.Value.y - 14, 24, 24), "▲", new GUIStyle(mk) { fontSize = 20 }, Color.white);
                GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1));
            }
        }

        void DrawToasts(float W, float H)
        {
            float y = H * 0.2f;
            foreach (var (s, t, big) in toasts)
            {
                float a = Mathf.Clamp01(t / 0.6f);
                var st = big ? new GUIStyle(h2) { fontSize = 26, alignment = TextAnchor.MiddleCenter } : new GUIStyle(label) { alignment = TextAnchor.MiddleCenter };
                var c = big ? Accent : Color.white;
                c.a = a;
                Text(new Rect(W / 2 - 400, y, 800, 34), s, st, c);
                y += big ? 36 : 28;
            }
        }

        // ------------------------------------------------------------ menus

        Rect PanelRect(float W, float H, float w, float h)
        {
            w = Mathf.Min(w, W - 32);
            h = Mathf.Min(h, H - 32);
            var r = new Rect((W - w) / 2, (H - h) / 2, w, h);
            Rect(new Rect(0, 0, W, H), new Color(0.04f, 0.05f, 0.03f, 0.55f));
            Rect(r, Panel);
            Rect(new Rect(r.x, r.y, r.width, 2), Accent);
            return new Rect(r.x + 28, r.y + 24, r.width - 56, r.height - 48);
        }

        void MenuPanel(float W, float H)
        {
            var r = PanelRect(W, H, 860, 760);
            GUILayout.BeginArea(r);
            GUILayout.Label("EELAM WAR IV · 2006 – 2009", eyebrow);
            GUILayout.Label("WANNI FRONT", h1);
            GUILayout.Label("වන්නි සටන් බිම", si);
            GUILayout.Label("A first-person campaign through six real operations of the final phase of the Sri Lankan civil war — from Mavil Aru to Nandikadal.", body);
            GUILayout.Space(12);
            for (int row = 0; row < 2; row++)
            {
                GUILayout.BeginHorizontal();
                for (int col = 0; col < 3; col++)
                {
                    int i = row * 3 + col;
                    var m = Missions.All[i];
                    bool unlocked = i <= Unlocked;
                    GUI.enabled = unlocked;
                    string txt = "MISSION " + (i + 1) + "\n" + m.name + "\n" + m.date + (Done(m.id) ? "\n✔ completed" : "");
                    if (GUILayout.Button(txt, new GUIStyle(btn) { fontSize = 15, alignment = TextAnchor.MiddleLeft, fixedHeight = 96 }, GUILayout.ExpandWidth(true)))
                    {
                        StartMission(i);
                    }
                    GUI.enabled = true;
                }
                GUILayout.EndHorizontal();
            }
            GUILayout.Space(10);
            GUILayout.BeginHorizontal();
            GUILayout.Label("Difficulty", label, GUILayout.Width(100));
            string[] names = { "Recruit", "Soldier", "Veteran" };
            float[] vals = { 0.6f, 1f, 1.45f };
            for (int i = 0; i < 3; i++)
            {
                var st = new GUIStyle(btn) { fontSize = 15 };
                if (Mathf.Approximately(difficulty, vals[i])) st.normal.textColor = Accent;
                if (GUILayout.Button(names[i], st, GUILayout.Width(110))) { difficulty = vals[i]; PlayerPrefs.SetFloat("wf_difficulty", difficulty); }
            }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            GUILayout.Label("Mouse sensitivity", label, GUILayout.Width(160));
            float sens = GUILayout.HorizontalSlider(GameInput.MouseSensitivity, 0.3f, 6f, GUILayout.Width(260));
            if (!Mathf.Approximately(sens, GameInput.MouseSensitivity)) { GameInput.MouseSensitivity = sens; PlayerPrefs.SetFloat("wf_sens", sens); }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            GUILayout.Space(8);
            GUILayout.Label("<b>Controls</b>  WASD move · Mouse look · LMB fire · RMB aim / scope · Shift sprint (hold breath when scoped) · C crouch · Z prone · Space jump/stand · R reload · 1-3 weapons · G grenade · B binoculars · M map · E interact · H dressing · Esc pause", new GUIStyle(small) { richText = true });
            GUILayout.Space(6);
            GUILayout.Label("Based on public historical records. Respect for all who lost their lives — soldiers, cadres and civilians.", small);
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Quit", btn, GUILayout.Width(120))) Application.Quit();
            GUILayout.EndArea();
        }

        void BriefingPanel(float W, float H)
        {
            var m = mission;
            var r = PanelRect(W, H, 860, 780);
            GUILayout.BeginArea(r);
            GUILayout.Label(("MISSION " + (missionIndex + 1) + " · " + m.date).ToUpper(), eyebrow);
            GUILayout.Label("Operation: " + m.name, h2);
            GUILayout.Label(m.si, si);
            GUILayout.Label(m.place + "  ·  " + m.role, small);
            GUILayout.Space(8);
            scroll = GUILayout.BeginScrollView(scroll, GUILayout.ExpandHeight(true));
            foreach (var para in m.briefing) { GUILayout.Label(para, body); GUILayout.Space(6); }
            GUILayout.Space(6);
            GUILayout.Label("OBJECTIVES", eyebrow);
            for (int i = 0; i < m.objectives.Length; i++) GUILayout.Label((i + 1) + ".  " + m.objectives[i].text, body);
            GUILayout.EndScrollView();
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Begin mission", btn, GUILayout.Width(200))) Begin();
            if (GUILayout.Button("Back", btn, GUILayout.Width(120))) state = GameState.Menu;
            GUILayout.EndHorizontal();
            GUILayout.EndArea();
        }

        void PausePanel(float W, float H)
        {
            var r = PanelRect(W, H, 420, 300);
            GUILayout.BeginArea(r);
            GUILayout.Label("Paused", h2);
            GUILayout.Space(10);
            if (GUILayout.Button("Resume", btn)) Resume();
            if (GUILayout.Button("Restart mission", btn)) { Time.timeScale = 1; StartMission(missionIndex); Begin(); }
            if (GUILayout.Button("Quit to menu", btn)) { Time.timeScale = 1; StartMission(missionIndex); state = GameState.Menu; }
            GUILayout.EndArea();
        }

        void CompletePanel(float W, float H)
        {
            var r = PanelRect(W, H, 760, 440);
            GUILayout.BeginArea(r);
            GUILayout.Label("MISSION COMPLETE", eyebrow);
            GUILayout.Label(mission.name + " — " + mission.date, h2);
            GUILayout.Space(8);
            GUILayout.Label(mission.debrief, body);
            GUILayout.Space(8);
            int acc = shotsFired > 0 ? Mathf.RoundToInt(100f * shotsHit / shotsFired) : 0;
            GUILayout.Label(string.Format("Time {0}:{1:00} · Hostiles neutralised {2} · Accuracy {3}%", (int)(missionTime / 60), (int)(missionTime % 60), kills, acc), small);
            GUILayout.FlexibleSpace();
            GUILayout.BeginHorizontal();
            bool last = missionIndex + 1 >= Missions.All.Length;
            if (GUILayout.Button(last ? "Epilogue" : "Next mission", btn, GUILayout.Width(200)))
            {
                if (last) state = GameState.Epilogue;
                else StartMission(missionIndex + 1);
            }
            if (GUILayout.Button("Menu", btn, GUILayout.Width(120))) state = GameState.Menu;
            GUILayout.EndHorizontal();
            GUILayout.EndArea();
        }

        void FailedPanel(float W, float H)
        {
            var r = PanelRect(W, H, 640, 280);
            GUILayout.BeginArea(r);
            GUILayout.Label("MISSION FAILED", new GUIStyle(eyebrow) { normal = { textColor = Danger } });
            GUILayout.Label(failReason, new GUIStyle(h2) { fontSize = 26 });
            GUILayout.FlexibleSpace();
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Retry", btn, GUILayout.Width(160))) { StartMission(missionIndex); Begin(); }
            if (GUILayout.Button("Menu", btn, GUILayout.Width(120))) { StartMission(missionIndex); state = GameState.Menu; }
            GUILayout.EndHorizontal();
            GUILayout.EndArea();
        }

        void EpiloguePanel(float W, float H)
        {
            var r = PanelRect(W, H, 760, 480);
            GUILayout.BeginArea(r);
            GUILayout.Label("18 – 19 MAY 2009", eyebrow);
            GUILayout.Label("The end of the war", h2);
            GUILayout.Space(10);
            foreach (var para in Missions.All[Missions.All.Length - 1].epilogue) { GUILayout.Label(para, body); GUILayout.Space(8); }
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Main menu", btn, GUILayout.Width(200))) state = GameState.Menu;
            GUILayout.EndArea();
        }
    }
}
