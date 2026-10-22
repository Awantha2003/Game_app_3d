using System;
using UnityEngine;

namespace WanniFront
{
    public enum ObjType { Reach, Clear, Interact, Escort, DisableAlarm }

    public class SpawnDef
    {
        public float x, z;
        public int n;
        public string tag;
    }

    public class ObjectiveDef
    {
        public ObjType type;
        public string tag;
        public string text;
        public Vector2 pos;
        public float r = 10;
        public Vector3 zone; // x, z, radius
        public SpawnDef[] spawn;
    }

    public class MissionDef
    {
        public string id, name, si, date, place, role;
        public string[] briefing;
        public string debrief;
        public string[] epilogue;
        public float size = 120;
        public Func<float, float, float> height;
        public float water = float.NaN;
        public bool HasWater => !float.IsNaN(water);
        public string ground = "grass";   // grass | paddy | jungle | dry | coastal | sand
        public string border = "palm_coconut";
        public Color fog = new Color(0.72f, 0.78f, 0.8f);
        public float fogDensity = 0.006f;
        public float sunPitch = 45, sunYaw = -30, sunIntensity = 1.25f;
        public Color sunColor = new Color(1f, 0.95f, 0.85f);
        public Color skyTint = new Color(0.5f, 0.55f, 0.6f);
        public float exposure = 1.25f;
        public bool rain, shelling, jungleSounds;
        public Vector2 playerStart;
        public float playerYaw = 180;
        public int allies;
        public Action<World> layout;
        public ObjectiveDef[] objectives;
    }

    /// <summary>
    /// The campaign: six real operations of Eelam War IV (2006–2009).
    /// Dates, places and formations follow public sources (see README).
    /// North is -Z; the player always starts in the south.
    /// </summary>
    public static class Missions
    {
        static float S(float a, float b, float x) => Noise.Smooth(a, b, x);
        static float F(float x, float z) => Noise.Fbm(x, z);
        const float PI = Mathf.PI;

        public static readonly MissionDef[] All =
        {
            new MissionDef
            {
                id = "mavilaru", name = "Mavil Aru", si = "මාවිල් ආරු", date = "July – August 2006",
                place = "Trincomalee District, Eastern Province", role = "Infantry section, Sri Lanka Army",
                briefing = new[]
                {
                    "On 21 July 2006 the LTTE closed the sluice gates of the Mavil Aru anicut, cutting off irrigation water to thousands of farming families downstream.",
                    "Talks brokered by the Sri Lanka Monitoring Mission failed. After air strikes on 26 July, ground troops moved in to reopen the gates. The gates were opened again on 8 August 2006.",
                    "The fighting at Mavil Aru is generally seen as the start of Eelam War IV. The gate area has a camp alarm — if a cadre reaches it, reinforcements will come.",
                },
                debrief = "With the water flowing again, the army pushed on through the East: Sampur fell in September 2006 and Vakarai in January 2007.",
                ground = "paddy", border = "tree_jungle", jungleSounds = true,
                fog = new Color(0.74f, 0.8f, 0.82f), fogDensity = 0.005f, sunPitch = 38, sunYaw = -40,
                water = -0.6f,
                height = (x, z) =>
                {
                    float canal = Mathf.Abs(x - 40) < 7 ? -2.2f * S(7, 4, Mathf.Abs(x - 40)) : 0;
                    float edge = S(70, 110, Mathf.Abs(x)) * 6 + F(x * 0.03f, z * 0.03f) * 1.2f;
                    return canal + edge * (1 - S(10, 4, Mathf.Abs(x - 40)));
                },
                playerStart = new Vector2(0, 100), allies = 3,
                layout = w =>
                {
                    w.Prop("sluice_gate", 40, -50, 0);
                    w.Scatter("tree_jungle", 70, -118, -70, -118, 118);
                    w.Scatter("tree_jungle", 50, 60, 118, -118, 118);
                    w.Scatter("palm_coconut", 40, -70, 30, -118, 118, new[] { new Vector3(0, 100, 15), new Vector3(0, 30, 14), new Vector3(10, -40, 18) });
                    w.Scatter("bush", 90, -110, 110, -118, 118);
                    w.Prop("buffel", 6, 108, 0.2f);
                    w.Prop("supplies", -5, 106, 0);
                    w.Prop("bunker", -8, 30, 0); w.Prop("bunker", 12, 26, 0.6f);
                    w.Prop("sandbag_wall", 2, 34, 0); w.Prop("sandbag_wall", -18, 28, 0.4f);
                    w.Enemies(6, 0, 28, 14, "outpost", true);
                    w.Prop("bunker", 20, -40, 0); w.Prop("bunker", 24, -62, 1);
                    w.Prop("sandbag_wall", 28, -48, PI / 2); w.Prop("sandbag_wall", 15, -55, 0.2f);
                    w.Prop("house_ruined", 8, -70, 0.3f);
                    w.Prop("supplies", 0, -10, 0.5f);
                    w.Tower(-4, -60, 0.4f, "gate");
                    w.Alarm(10, -66, 0.2f, "gate");
                    w.Enemies(7, 18, -52, 14, "gate", true);
                    w.Target("gate", 31, -50, "Sluice gate controls", 3);
                },
                objectives = new[]
                {
                    new ObjectiveDef { type = ObjType.Clear, tag = "outpost", text = "Clear the LTTE outpost in the paddy fields" },
                    new ObjectiveDef { type = ObjType.Reach, pos = new Vector2(20, -30), r = 12, text = "Advance to the Mavil Aru anicut" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "gate", text = "Secure the anicut", spawn = new[] { new SpawnDef { x = 10, z = -90, n = 3, tag = "gate" } } },
                    new ObjectiveDef { type = ObjType.Interact, tag = "gate", text = "Open the sluice gates" },
                },
            },

            new MissionDef
            {
                id = "thoppigala", name = "Thoppigala", si = "තොප්පිගල", date = "July 2007",
                place = "Batticaloa District, Eastern Province", role = "Special Forces operator (solo infiltration)",
                briefing = new[]
                {
                    "After Mavil Aru, Sampur and Vakarai, the LTTE's last stronghold in the East was the jungle around Thoppigala — a granite massif the British called \"Baron's Cap\".",
                    "Army Special Forces and Commandos fought through thick jungle to reach it. Thoppigala was captured on 11 July 2007.",
                    "You go in alone at dawn. Stay low, use the jungle, mark sentries with your binoculars and cut the camp alarm before you strike. If the alarm sounds, the whole area will come for you.",
                },
                debrief = "The capture of Thoppigala ended LTTE military control in the East. The army now prepared for the much larger Northern campaign.",
                ground = "jungle", border = "tree_jungle", jungleSounds = true,
                fog = new Color(0.78f, 0.74f, 0.66f), fogDensity = 0.014f, sunPitch = 10, sunYaw = 70,
                sunColor = new Color(1f, 0.78f, 0.55f), sunIntensity = 1.0f, skyTint = new Color(0.6f, 0.5f, 0.45f),
                height = (x, z) => F(x * 0.02f, z * 0.02f) * 9 + S(60, 10, Mathf.Sqrt(x * x + (z + 75) * (z + 75))) * 4,
                playerStart = new Vector2(-10, 105), allies = 0,
                layout = w =>
                {
                    w.Prop("rock_outcrop", 0, -78, 0, 1.3f);
                    w.Prop("rock_small", 25, -40, 0, 2); w.Prop("rock_small", -30, 10, 1, 1.6f);
                    w.Prop("bunker", 4, 38, 0.3f); w.Prop("sandbag_wall", -6, 44, 0.1f); w.Prop("supplies", 2, 46, 1);
                    w.Prop("bunker", -20, -18, 1); w.Prop("sandbag_wall", -10, -14, 0.5f); w.Prop("house_ruined", -28, -26, 1.2f);
                    w.Prop("bunker", 18, -55, 0.2f); w.Prop("bunker", -18, -58, 2.2f);
                    w.Tower(14, 30, 0.2f, "camp1");
                    w.Tower(-6, -30, 1.1f, "camp2");
                    w.Alarm(-26, -12, 0.5f, "camp2");
                    w.Scatter("tree_jungle", 240, -118, 118, -118, 118, new[] { new Vector3(-10, 105, 12), new Vector3(0, 40, 16), new Vector3(-20, -20, 16), new Vector3(0, -78, 28) });
                    w.Scatter("bush", 260, -118, 118, -118, 118, new[] { new Vector3(-10, 105, 8), new Vector3(0, -78, 22) });
                    w.Scatter("rock_small", 30, -110, 110, -110, 110, new[] { new Vector3(0, -78, 25) });
                    w.Prop("supplies", -4, 100, 0);
                    w.Enemies(5, 0, 40, 14, "camp1", true);
                    w.Enemies(6, -18, -20, 14, "camp2", true);
                    w.Enemies(5, 0, -55, 16, "peak", true);
                },
                objectives = new[]
                {
                    new ObjectiveDef { type = ObjType.Clear, tag = "camp1", text = "Neutralise the first jungle camp" },
                    new ObjectiveDef { type = ObjType.DisableAlarm, tag = "camp2", text = "Sabotage the alarm at the second camp" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "camp2", text = "Clear the second camp" },
                    new ObjectiveDef { type = ObjType.Reach, pos = new Vector2(0, -48), r = 10, text = "Reach the foot of Baron's Cap" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "peak", text = "Eliminate the last defenders of Thoppigala", spawn = new[] { new SpawnDef { x = 30, z = -90, n = 3, tag = "peak" } } },
                },
            },

            new MissionDef
            {
                id = "pooneryn", name = "Pooneryn", si = "පූනරින්", date = "November 2008",
                place = "North-west coast, Kilinochchi District", role = "Task Force 1 (58 Division)",
                briefing = new[]
                {
                    "Through 2008, Task Force 1 (later the 58 Division) advanced up the north-west coast from Mannar: Adampan in May, Vidattaltivu in July.",
                    "In October the troops seized Nachchikuda, once a major Sea Tiger base, and pushed along the A-32 road towards Pooneryn.",
                    "At dawn on 15 November 2008, soldiers of the 12th Gemunu Watch and 10th Gajaba Regiment entered Pooneryn — the last LTTE stronghold on the western coast.",
                },
                debrief = "Pooneryn fell on 15 November 2008. With the west coast secured, the army turned east towards Kilinochchi.",
                ground = "coastal", border = "palm_palmyrah",
                fog = new Color(0.86f, 0.74f, 0.6f), fogDensity = 0.006f, sunPitch = 9, sunYaw = -100,
                sunColor = new Color(1f, 0.7f, 0.45f), sunIntensity = 1.1f, skyTint = new Color(0.65f, 0.5f, 0.4f),
                water = -0.4f,
                height = (x, z) =>
                {
                    float coast = -45 + Mathf.Sin(z * 0.03f) * 8;
                    float land = S(coast - 8, coast + 6, x);
                    return -3 + land * (3.2f + F(x * 0.03f, z * 0.03f) * 1.5f);
                },
                playerStart = new Vector2(10, 105), allies = 2,
                layout = w =>
                {
                    w.Prop("house_ruined", -25, 18, 0.2f); w.Prop("bunker", -30, 40, 0); w.Prop("bunker", -28, 2, 1);
                    w.Prop("supplies", -22, 30, 0.4f); w.Prop("sandbag_wall", -18, 22, PI / 2);
                    w.Tower(-14, 8, 0.3f, "base");
                    w.Alarm(-20, 34, 1.2f, "base");
                    float[,] town = { { 0, -70, 0 }, { 18, -74, 0.2f }, { -14, -86, 1.6f }, { 8, -95, 3.1f }, { 26, -92, 1.5f }, { -6, -60, 0.1f } };
                    for (int i = 0; i < town.GetLength(0); i++) w.Prop(i % 2 == 0 ? "house" : "house_ruined", town[i, 0], town[i, 1], town[i, 2]);
                    w.Prop("sandbag_wall", 10, -58, 0); w.Prop("bunker", -20, -66, 0.4f);
                    w.Scatter("palm_palmyrah", 70, -30, 118, -118, 118, new[] { new Vector3(10, 105, 12), new Vector3(-35, 20, 18), new Vector3(10, -80, 25) });
                    w.Scatter("palm_coconut", 45, -40, 60, -118, 118, new[] { new Vector3(10, 105, 12), new Vector3(-35, 20, 18), new Vector3(10, -80, 25) });
                    w.Scatter("bush", 120, -35, 118, -118, 118, new[] { new Vector3(10, 105, 8) });
                    w.Prop("buffel", 18, 112, -0.2f); w.Prop("supplies", 4, 110, 0);
                    w.Target("boat", -44, 10, "Sea Tiger boat", 2.5f, "seatiger_boat", 1.4f, true);
                    w.Target("boat", -43, 22, "Sea Tiger boat", 2.5f, "seatiger_boat", 1.7f, true);
                    w.Target("boat", -44.5f, 34, "Sea Tiger boat", 2.5f, "seatiger_boat", 1.5f, true);
                    w.Enemies(8, -32, 22, 14, "base", true);
                    w.Enemies(9, 6, -78, 18, "town", false);
                },
                objectives = new[]
                {
                    new ObjectiveDef { type = ObjType.Clear, tag = "base", text = "Assault the Sea Tiger base at Nachchikuda" },
                    new ObjectiveDef { type = ObjType.Interact, tag = "boat", text = "Plant charges on the Sea Tiger boats" },
                    new ObjectiveDef { type = ObjType.Reach, pos = new Vector2(8, -50), r = 12, text = "Advance up the A-32 to Pooneryn" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "town", text = "Secure Pooneryn town" },
                },
            },

            new MissionDef
            {
                id = "kilinochchi", name = "Kilinochchi", si = "කිලිනොච්චිය", date = "November 2008 – January 2009",
                place = "Kilinochchi District, Wanni", role = "57 Division",
                briefing = new[]
                {
                    "Kilinochchi was the administrative centre of the LTTE. To protect it, the Tigers built a long arc of ditches and earth bunds across the approaches.",
                    "The 57 Division attacked from the south and west while Task Force 1 swung up from Pooneryn to converge from the north. The fighting lasted from November 2008 into the new year, through the north-east monsoon rains.",
                    "Troops entered Kilinochchi town on 2 January 2009. Before withdrawing, the LTTE blew up the town's water tower — its toppled remains still stand as a memorial.",
                },
                debrief = "Kilinochchi fell on 2 January 2009 after one of the longest battles of the war. The LTTE fell back towards Mullaitivu.",
                ground = "dry", border = "palm_coconut", rain = true, shelling = true,
                fog = new Color(0.55f, 0.58f, 0.6f), fogDensity = 0.012f, sunPitch = 50, sunYaw = 20,
                sunColor = new Color(0.75f, 0.78f, 0.82f), sunIntensity = 0.55f, skyTint = new Color(0.4f, 0.42f, 0.45f), exposure = 0.8f,
                height = (x, z) => F(x * 0.025f, z * 0.025f) * 2.5f - S(4, 0, Mathf.Abs(z - 34)) * 1.4f,
                playerStart = new Vector2(0, 105), allies = 4,
                layout = w =>
                {
                    for (int x = -110; x <= 110; x += 20)
                        if (Mathf.Abs(x) >= 12) w.Prop("earth_bund", x, 28, 0);
                    w.Prop("bunker", -6, 20, 0); w.Prop("bunker", 8, 19, 1.2f);
                    w.Prop("sandbag_wall", -16, 22, 0); w.Prop("sandbag_wall", 16, 22, 0);
                    float[,] town = { { -24, -20, 0 }, { -8, -28, 1.57f }, { 14, -22, 0 }, { 28, -34, 1.57f }, { -30, -46, 0 }, { -14, -56, 3.14f },
                        { 16, -54, 0 }, { 30, -66, 1.57f }, { -28, -76, 0.2f }, { 0, -84, 3.1f }, { 20, -88, 0 } };
                    for (int i = 0; i < town.GetLength(0); i++) w.Prop(i % 3 == 0 ? "house" : "house_ruined", town[i, 0], town[i, 1], town[i, 2]);
                    w.Prop("water_tower", -2, -66, 0.4f);
                    w.Prop("sandbag_wall", 4, -40, 0); w.Prop("supplies", -4, -36, 0.4f);
                    w.Tower(22, -10, 0.2f, "town");
                    w.Scatter("palm_palmyrah", 50, -118, 118, 50, 118, new[] { new Vector3(0, 105, 14) });
                    w.Scatter("palm_coconut", 50, -118, 118, -118, 20, new[] { new Vector3(0, -40, 40) });
                    w.Scatter("bush", 120, -118, 118, -118, 118, new[] { new Vector3(0, 105, 8) });
                    w.Prop("buffel", -10, 110, 0.1f); w.Prop("buffel", 12, 112, -0.1f); w.Prop("supplies", 0, 98, 0);
                    w.Enemies(8, 0, 16, 18, "bund", false);
                    w.Enemies(11, 0, -50, 26, "town", true);
                },
                objectives = new[]
                {
                    new ObjectiveDef { type = ObjType.Clear, tag = "bund", text = "Clear the bunkers behind the earth bund" },
                    new ObjectiveDef { type = ObjType.Reach, pos = new Vector2(0, 28), r = 8, text = "Breach the earth bund" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "town", text = "Clear Kilinochchi town", spawn = new[] { new SpawnDef { x = 0, z = -110, n = 4, tag = "town" } } },
                    new ObjectiveDef { type = ObjType.Reach, pos = new Vector2(-2, -58), r = 10, text = "Reach the water tower" },
                },
            },

            new MissionDef
            {
                id = "elephantpass", name = "Elephant Pass", si = "අලිමංකඩ", date = "January 2009",
                place = "Gateway to the Jaffna peninsula", role = "Infantry, northern advance",
                briefing = new[]
                {
                    "Elephant Pass is a narrow causeway between two lagoons — the only land link between the Jaffna peninsula and the mainland. The LTTE overran the army base there in April 2000, cutting Jaffna off by land for nine years.",
                    "After Kilinochchi fell, troops pushed north along the A9 while the 53 and 55 Divisions advanced from the Jaffna side.",
                    "On 9 January 2009 the army recaptured Elephant Pass and the forces linked up, reopening the A9 road to Jaffna. Watch the towers on the causeway — snipers have long sightlines over the lagoon.",
                },
                debrief = "Elephant Pass was back in government hands on 9 January 2009. Mullaitivu, the LTTE's main military base, fell on 25 January.",
                ground = "sand", border = "palm_palmyrah", shelling = true,
                fog = new Color(0.85f, 0.87f, 0.86f), fogDensity = 0.007f, sunPitch = 25, sunYaw = 100,
                water = -0.4f,
                height = (x, z) =>
                {
                    float road = x - (Mathf.Sin(z * 0.04f) * 4 + 2);
                    float land = S(16, 9, Mathf.Abs(road)) + S(14, 4, Mathf.Sqrt((x - 22) * (x - 22) + (z + 40) * (z + 40))) * 0.8f;
                    return -2.5f + Mathf.Min(1, land) * (3 + F(x * 0.05f, z * 0.05f) * 0.6f);
                },
                playerStart = new Vector2(0, 108), allies = 3,
                layout = w =>
                {
                    w.Prop("bunker", 0, 60, 0); w.Prop("sandbag_wall", -4, 54, 0.1f); w.Prop("sandbag_wall", 6, 52, -0.2f);
                    w.Tower(6, 66, 0, "south");
                    w.Prop("house_ruined", 18, -38, 0); w.Prop("house_ruined", 26, -46, 1.5f); w.Prop("house_ruined", 8, -50, 0.3f);
                    w.Prop("bunker", 2, -20, 0.6f); w.Prop("bunker", 14, -26, 2);
                    w.Prop("sandbag_wall", -2, -30, 0); w.Prop("supplies", 22, -30, 0);
                    w.Tower(-6, -42, 0.3f, "base");
                    w.Alarm(20, -52, 0, "base");
                    w.Prop("buffel", 6, -112, PI); w.Prop("buffel", -3, -118, PI - 0.2f);
                    w.Scatter("bush", 60, -14, 30, -118, 118, new[] { new Vector3(0, 108, 6) });
                    w.Scatter("palm_palmyrah", 18, -14, 30, -118, 118, new[] { new Vector3(0, 108, 8) });
                    w.Prop("buffel", 4, 116, 0); w.Prop("supplies", -4, 102, 0);
                    w.Enemies(6, 1, 55, 9, "south", false);
                    w.Enemies(9, 10, -36, 14, "base", true);
                    w.Friendlies(4, 2, -110, 6);
                },
                objectives = new[]
                {
                    new ObjectiveDef { type = ObjType.Clear, tag = "south", text = "Break through the LTTE line on the causeway" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "base", text = "Recapture the old Elephant Pass base" },
                    new ObjectiveDef { type = ObjType.Reach, pos = new Vector2(2, -104), r = 10, text = "Link up with the 53 Division" },
                },
            },

            new MissionDef
            {
                id = "nandikadal", name = "Nandikadal", si = "නන්දිකඩාල්", date = "May 2009",
                place = "Mullaitivu District, north-east coast", role = "Infantry, final offensive",
                briefing = new[]
                {
                    "By May 2009 the remaining LTTE fighters were confined to a narrow strip of land between the Nandikadal lagoon and the sea, together with a very large number of trapped civilians.",
                    "In the final weeks, hundreds of thousands of civilians crossed to government-held areas. Many others were killed; the scale of civilian loss in these final months remains the subject of calls for accountability.",
                    "Your orders: bring civilians out of the combat zone safely. Civilian casualties are unacceptable — killing a civilian ends the mission.",
                },
                debrief = "The fighting ended at Nandikadal on 18 May 2009, and the government declared the war over on 19 May.",
                epilogue = new[]
                {
                    "The Sri Lankan Civil War lasted from 1983 to 2009.",
                    "Tens of thousands of soldiers, LTTE cadres and civilians lost their lives, and hundreds of thousands were displaced.",
                    "This game remembers everyone who was lost — on every side — and hopes for lasting peace and reconciliation among all Sri Lankans.",
                },
                ground = "sand", border = "palm_coconut", shelling = true,
                fog = new Color(0.7f, 0.68f, 0.62f), fogDensity = 0.011f, sunPitch = 30, sunYaw = 140,
                sunColor = new Color(1f, 0.88f, 0.72f), sunIntensity = 1.0f, skyTint = new Color(0.55f, 0.52f, 0.48f),
                water = -0.4f,
                height = (x, z) =>
                {
                    float shore = 30 + Mathf.Sin(z * 0.05f) * 6;
                    return -2.5f + S(shore + 6, shore - 6, x) * (3 + F(x * 0.04f, z * 0.04f) * 0.8f);
                },
                playerStart = new Vector2(-20, 100), allies = 3,
                layout = w =>
                {
                    w.Prop("house_ruined", -40, 20, 0.5f); w.Prop("house_ruined", 0, 0, 2); w.Prop("sandbag_wall", -18, 14, 0);
                    w.Prop("bunker", -24, 6, 0.3f);
                    w.Prop("house_ruined", -14, -48, 0.2f); w.Prop("house_ruined", 6, -64, 1.7f);
                    w.Prop("bunker", -40, -90, 0); w.Prop("bunker", 0, -96, 1);
                    w.Scatter("palm_coconut", 90, -118, 30, -118, 118, new[] { new Vector3(-20, 100, 14), new Vector3(-5, -55, 14) });
                    w.Scatter("bush", 120, -118, 30, -118, 118, new[] { new Vector3(-20, 100, 8), new Vector3(-5, -55, 10) });
                    w.Prop("buffel", -12, 112, 0); w.Prop("supplies", -26, 104, 0);
                    w.Enemies(8, -22, 6, 18, "line", false);
                    w.Civilians(8, -5, -55, 6);
                    w.Enemies(6, -6, -35, 18, "nfz", false);
                    w.Enemies(7, -18, -92, 16, "last", false);
                },
                objectives = new[]
                {
                    new ObjectiveDef { type = ObjType.Clear, tag = "line", text = "Break through the last LTTE defence line" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "nfz", text = "Clear the fighters around the civilians" },
                    new ObjectiveDef { type = ObjType.Escort, zone = new Vector3(-20, 95, 12), pos = new Vector2(-5, -55), text = "Lead the civilians back to army lines" },
                    new ObjectiveDef { type = ObjType.Clear, tag = "last", text = "Clear the final LTTE position" },
                },
            },
        };
    }
}
