using System.Collections.Generic;
using UnityEngine;

namespace WanniFront
{
    public enum Team { Army, LTTE, Civilian }

    public class SpawnRec
    {
        public Team team;
        public Vector3 pos;
        public string tag;
        public bool patrol, sentry;
        public float yaw;
    }

    public class TargetRec
    {
        public string tag, label;
        public Vector3 pos;
        public float time;
        public bool plant, done, pending;
        public GameObject obj;
    }

    public class AlarmRec
    {
        public string tag;
        public Vector3 pos;
        public GameObject obj;
        public bool disabled, triggered;
        public Unit runner;
    }

    /// <summary>
    /// Builds a mission's world: Unity terrain with painted textures and grass,
    /// water, sky, sun, fog, rain and every prop, and records spawn points.
    /// </summary>
    public class World : MonoBehaviour
    {
        public MissionDef def;
        public Terrain terrain;
        public readonly List<SpawnRec> spawns = new List<SpawnRec>();
        public readonly List<TargetRec> targets = new List<TargetRec>();
        public readonly List<AlarmRec> alarms = new List<AlarmRec>();
        public readonly List<Vector3> supplies = new List<Vector3>();
        public readonly List<Vector3> towers = new List<Vector3>();
        readonly List<Vector3> obstacles = new List<Vector3>(); // x, z, radius
        System.Random rng;
        Transform props;
        ParticleSystem rain;
        Light sun;

        const float BaseY = -12f, HeightRange = 60f;

        public float Size => def.size;

        public static World Build(MissionDef def, int seed)
        {
            var go = new GameObject("World - " + def.name);
            var w = go.AddComponent<World>();
            w.def = def;
            w.rng = new System.Random(seed);
            w.props = new GameObject("Props").transform;
            w.props.SetParent(go.transform);
            w.BuildEnvironment();
            w.BuildTerrain();
            w.BuildWater();
            def.layout(w);
            w.Scatter(def.border, 110, -def.size - 60, def.size + 60, -def.size - 60, def.size + 60, null, true);
            w.PaintGrass();
            return w;
        }

        public float Rng() => (float)rng.NextDouble();

        public float Height(float x, float z) => def.height(x, z);

        public float GroundY(Vector3 p) => terrain != null ? terrain.SampleHeight(p) + terrain.transform.position.y : Height(p.x, p.z);

        public bool IsWater(float x, float z, float depth = 0.6f) => def.HasWater && Height(x, z) < def.water - depth;

        // ------------------------------------------------------------ environment

        void BuildEnvironment()
        {
            sun = new GameObject("Sun").AddComponent<Light>();
            sun.transform.SetParent(transform);
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.85f;
            sun.intensity = def.sunIntensity;
            sun.color = def.sunColor;
            sun.transform.rotation = Quaternion.Euler(def.sunPitch, def.sunYaw, 0);
            RenderSettings.sun = sun;

            var skyShader = Shader.Find("Skybox/Procedural");
            if (skyShader != null)
            {
                var sky = new Material(skyShader);
                sky.SetFloat("_SunSize", 0.035f);
                sky.SetFloat("_AtmosphereThickness", def.rain ? 1.6f : 1.0f);
                sky.SetColor("_SkyTint", def.skyTint);
                sky.SetColor("_GroundColor", def.fog * 0.8f);
                sky.SetFloat("_Exposure", def.exposure);
                RenderSettings.skybox = sky;
            }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Skybox;
            RenderSettings.ambientIntensity = def.rain ? 0.8f : 1.0f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = def.fog;
            RenderSettings.fogDensity = def.fogDensity;
            DynamicGI.UpdateEnvironment();

            QualitySettings.shadowDistance = 140;
            QualitySettings.shadowCascades = 4;
            QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
            QualitySettings.shadowProjection = ShadowProjection.StableFit;

            if (def.rain) BuildRain();
        }

        void BuildRain()
        {
            var go = new GameObject("Rain");
            go.transform.SetParent(transform);
            rain = go.AddComponent<ParticleSystem>();
            rain.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = rain.main;
            main.startLifetime = 1.3f;
            main.startSpeed = 22f;
            main.startSize = 0.03f;
            main.startColor = new Color(0.75f, 0.8f, 0.85f, 0.45f);
            main.maxParticles = 8000;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = rain.emission;
            em.rateOverTime = 4500;
            var shape = rain.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(50, 1, 50);
            go.transform.rotation = Quaternion.Euler(90, 0, 0);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.04f;
            r.lengthScale = 1f;
            r.material = Library.ParticleMaterial(false, Library.SoftDot);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            rain.Play();
        }

        void LateUpdate()
        {
            var cam = Camera.main;
            if (rain != null && cam != null) rain.transform.position = cam.transform.position + Vector3.up * 18;
        }

        // ------------------------------------------------------------ terrain

        void BuildTerrain()
        {
            float ext = def.size + 80;
            float size = ext * 2;
            var td = new TerrainData { heightmapResolution = 513 };
            td.size = new Vector3(size, HeightRange, size);
            int res = td.heightmapResolution;
            var h = new float[res, res];
            for (int zi = 0; zi < res; zi++)
            for (int xi = 0; xi < res; xi++)
            {
                float x = -ext + xi * size / (res - 1);
                float z = -ext + zi * size / (res - 1);
                h[zi, xi] = Mathf.Clamp01((Height(x, z) - BaseY) / HeightRange);
            }
            td.SetHeights(0, 0, h);

            string[] names = { "ground_grass", "ground_drygrass", "ground_dirt", "ground_sand", "ground_mud", "ground_paddy" };
            var layers = new TerrainLayer[names.Length];
            for (int i = 0; i < names.Length; i++)
            {
                layers[i] = new TerrainLayer
                {
                    diffuseTexture = Resources.Load<Texture2D>("Textures/" + names[i]),
                    normalMapTexture = Resources.Load<Texture2D>("Textures/" + names[i] + "_n"),
                    tileSize = new Vector2(7, 7),
                    smoothness = 0.05f,
                    normalScale = 0.8f,
                };
            }
            td.terrainLayers = layers;

            int ares = 512;
            td.alphamapResolution = ares;
            var alpha = new float[ares, ares, names.Length];
            var wgt = new float[names.Length];
            for (int zi = 0; zi < ares; zi++)
            for (int xi = 0; xi < ares; xi++)
            {
                float x = -ext + (xi + 0.5f) * size / ares;
                float z = -ext + (zi + 0.5f) * size / ares;
                Paint(x, z, wgt);
                float sum = 0;
                foreach (var v in wgt) sum += v;
                for (int l = 0; l < names.Length; l++) alpha[zi, xi, l] = wgt[l] / Mathf.Max(0.001f, sum);
            }
            td.SetAlphamaps(0, 0, alpha);

            var go = Terrain.CreateTerrainGameObject(td);
            go.name = "Terrain";
            go.transform.SetParent(transform);
            go.transform.position = new Vector3(-ext, BaseY, -ext);
            terrain = go.GetComponent<Terrain>();
            terrain.heightmapPixelError = 3;
            terrain.basemapDistance = 250;
            terrain.drawInstanced = true;
            terrain.detailObjectDistance = 70;
            terrain.detailObjectDensity = 1f;
        }

        void Paint(float x, float z, float[] w)
        {
            for (int i = 0; i < w.Length; i++) w[i] = 0;
            float h = Height(x, z);
            float n = Noise.Fbm(x * 0.05f + 7, z * 0.05f);
            float n2 = Noise.Fbm(x * 0.15f + 3, z * 0.15f);
            switch (def.ground)
            {
                case "paddy":
                    float gx = Mathf.Abs(((x + 1000) % 22) - 11), gz = Mathf.Abs(((z + 1000) % 18) - 9);
                    bool bund = gx > 10.1f || gz > 8.1f;
                    if (Mathf.Abs(x) > 68) { w[0] = 1; w[2] = n2 > 0.6f ? 1 : 0; }
                    else if (bund) { w[0] = 0.6f; w[2] = 0.6f; }
                    else { w[5] = 1; w[4] = n2 > 0.65f ? 0.6f : 0; }
                    break;
                case "jungle":
                    w[0] = 1; w[2] = n2 > 0.55f ? 1.2f : 0.15f; w[1] = n > 0.6f ? 0.5f : 0; w[4] = n2 < 0.3f ? 0.5f : 0;
                    break;
                case "coastal":
                    w[1] = 1; w[0] = n > 0.55f ? 0.8f : 0; w[2] = n2 > 0.62f ? 1 : 0; w[3] = 0.15f;
                    break;
                case "dry":
                    w[1] = 1; w[2] = n2 > 0.5f ? 1.3f : 0.2f; w[0] = n > 0.65f ? 0.6f : 0; w[4] = h < -0.6f ? 2 : 0;
                    break;
                case "sand":
                    w[3] = 1; w[1] = n > 0.5f ? 1 : 0.1f; w[2] = n2 > 0.7f ? 0.6f : 0;
                    break;
                default:
                    w[0] = 1; w[2] = n2 > 0.6f ? 0.8f : 0;
                    break;
            }
            if (def.HasWater)
            {
                if (h < def.water + 0.8f) { float k = Mathf.Clamp01((def.water + 0.8f - h) * 1.5f); for (int i = 0; i < w.Length; i++) w[i] *= 1 - k; w[3] += k; }
                if (h < def.water - 0.2f) w[4] += 2f;
            }
        }

        void PaintGrass()
        {
            var td = terrain.terrainData;
            var tex = Resources.Load<Texture2D>("Textures/grass_blade");
            if (tex == null) return;
            Color healthy = def.ground == "sand" || def.ground == "coastal" || def.ground == "dry"
                ? new Color(0.72f, 0.7f, 0.45f) : new Color(0.55f, 0.72f, 0.35f);
            var proto = new DetailPrototype
            {
                prototypeTexture = tex,
                renderMode = DetailRenderMode.GrassBillboard,
                healthyColor = healthy,
                dryColor = healthy * new Color(1.1f, 0.95f, 0.75f),
                minWidth = 0.5f, maxWidth = 1.0f, minHeight = 0.35f, maxHeight = 0.85f,
                noiseSpread = 0.3f,
            };
            td.detailPrototypes = new[] { proto };
            int res = 512;
            td.SetDetailResolution(res, 16);
            var dens = new int[res, res];
            float ext = def.size + 80, size = ext * 2;
            var alpha = td.GetAlphamaps(0, 0, td.alphamapWidth, td.alphamapHeight);
            for (int zi = 0; zi < res; zi++)
            for (int xi = 0; xi < res; xi++)
            {
                int ax = xi * td.alphamapWidth / res, az = zi * td.alphamapHeight / res;
                float grassy = alpha[az, ax, 0] + alpha[az, ax, 1] * 0.8f + alpha[az, ax, 5] * 1.2f;
                float x = -ext + (xi + 0.5f) * size / res, z = -ext + (zi + 0.5f) * size / res;
                float n = Noise.Fbm(x * 0.1f, z * 0.1f + 11);
                dens[zi, xi] = Mathf.RoundToInt(grassy * (2 + n * 6));
            }
            td.SetDetailLayer(0, 0, 0, dens);
            td.wavingGrassStrength = 0.35f;
            td.wavingGrassAmount = 0.35f;
            td.wavingGrassSpeed = 0.4f;
            td.wavingGrassTint = healthy;
        }

        void BuildWater()
        {
            if (!def.HasWater) return;
            var go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = "Water";
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(transform);
            go.transform.position = new Vector3(0, def.water, 0);
            go.transform.localScale = Vector3.one * (def.size + 400) / 5f;
            var m = new Material(Shader.Find("Standard"));
            m.SetFloat("_Mode", 3);
            m.SetOverrideTag("RenderType", "Transparent");
            m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.One);
            m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetInt("_ZWrite", 0);
            m.DisableKeyword("_ALPHATEST_ON");
            m.DisableKeyword("_ALPHABLEND_ON");
            m.EnableKeyword("_ALPHAPREMULTIPLY_ON");
            m.renderQueue = 3000;
            m.color = new Color(0.16f, 0.3f, 0.32f, 0.82f);
            m.SetFloat("_Glossiness", 0.93f);
            m.SetFloat("_Metallic", 0.1f);
            go.GetComponent<Renderer>().sharedMaterial = m;
            go.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        // ------------------------------------------------------------ layout API

        float Radius(string type)
        {
            switch (type)
            {
                case "palm_coconut": case "palm_palmyrah": return 0.6f;
                case "tree_jungle": return 1.2f;
                case "bush": return 0.8f;
                case "rock_small": return 1.3f;
                case "rock_outcrop": return 15f;
                case "house": case "house_ruined": return 4.5f;
                case "bunker": return 2.2f;
                case "sandbag_wall": return 2f;
                case "earth_bund": return 10.5f;
                case "buffel": return 2.6f;
                case "water_tower": return 6f;
                case "sluice_gate": return 9f;
                case "watchtower": return 2.2f;
                default: return 1.2f;
            }
        }

        public GameObject Prop(string type, float x, float z, float rotRad = 0, float scale = 1)
        {
            var pos = new Vector3(x, Height(x, z), z);
            var go = Library.Spawn(type, pos, rotRad * Mathf.Rad2Deg, scale, props);
            obstacles.Add(new Vector3(x, z, Radius(type) * scale));
            if (type == "supplies") supplies.Add(pos);
            if (type == "bush")
                foreach (var r in go.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        bool Blocked(float x, float z, float margin)
        {
            foreach (var o in obstacles)
            {
                float dx = x - o.x, dz = z - o.y;
                if (dx * dx + dz * dz < (o.z + margin) * (o.z + margin)) return true;
            }
            return false;
        }

        public void Scatter(string type, int n, float x0, float x1, float z0, float z1, Vector3[] avoid = null, bool ring = false)
        {
            float S = def.size;
            for (int i = 0, tries = 0; i < n && tries < n * 20; tries++)
            {
                float x = x0 + Rng() * (x1 - x0), z = z0 + Rng() * (z1 - z0);
                if (ring && Mathf.Abs(x) < S + 4 && Mathf.Abs(z) < S + 4) continue;
                if (IsWater(x, z, -0.3f)) continue;
                bool skip = false;
                if (avoid != null)
                    foreach (var a in avoid)
                        if ((x - a.x) * (x - a.x) + (z - a.y) * (z - a.y) < a.z * a.z) { skip = true; break; }
                if (skip) continue;
                if (type != "bush" && Blocked(x, z, 1.5f)) continue;
                Prop(type, x, z, Rng() * Mathf.PI * 2, 0.8f + Rng() * 0.45f);
                i++;
            }
        }

        Vector3 FreeSpot(float x, float z, float spread)
        {
            for (int k = 0; k < 40; k++)
            {
                float px = x + (Rng() - 0.5f) * spread * 2, pz = z + (Rng() - 0.5f) * spread * 2;
                if (!IsWater(px, pz, 0.2f) && !Blocked(px, pz, 0.6f)) return new Vector3(px, Height(px, pz), pz);
            }
            return new Vector3(x, Height(x, z), z);
        }

        public void Enemies(int n, float x, float z, float spread, string tag, bool patrol)
        {
            for (int i = 0; i < n; i++)
            {
                var p = FreeSpot(x, z, spread);
                float yaw = Mathf.Atan2(def.playerStart.x - p.x, def.playerStart.y - p.z) * Mathf.Rad2Deg + (Rng() - 0.5f) * 120;
                spawns.Add(new SpawnRec { team = Team.LTTE, pos = p, tag = tag, patrol = patrol && i % 2 == 0, yaw = yaw });
            }
        }

        public void Friendlies(int n, float x, float z, float spread)
        {
            for (int i = 0; i < n; i++) spawns.Add(new SpawnRec { team = Team.Army, pos = FreeSpot(x, z, spread), tag = "linkup", yaw = 0 });
        }

        public void Civilians(int n, float x, float z, float spread)
        {
            for (int i = 0; i < n; i++) spawns.Add(new SpawnRec { team = Team.Civilian, pos = FreeSpot(x, z, spread), tag = "civ", yaw = Rng() * 360 });
        }

        public void Target(string tag, float x, float z, string label, float time, string model = null, float rotRad = 0, bool plant = false)
        {
            var t = new TargetRec { tag = tag, label = label, time = time, plant = plant, pos = new Vector3(x, Height(x, z), z) };
            if (model != null)
            {
                float y = def.HasWater ? Mathf.Max(t.pos.y, def.water) - 0.2f : t.pos.y;
                t.obj = Library.Spawn(model, new Vector3(x, y, z), rotRad * Mathf.Rad2Deg, 1, props);
                obstacles.Add(new Vector3(x, z, 4));
            }
            targets.Add(t);
        }

        /// A log sentry tower with a cadre on top.
        public void Tower(float x, float z, float rotRad, string tag)
        {
            var go = Prop("watchtower", x, z, rotRad);
            towers.Add(go.transform.position);
            float top = 5.15f;
            spawns.Add(new SpawnRec { team = Team.LTTE, pos = go.transform.position + Vector3.up * top, tag = tag, sentry = true, yaw = Rng() * 360 });
        }

        public void Alarm(float x, float z, float rotRad, string tag)
        {
            var go = Prop("alarm", x, z, rotRad);
            alarms.Add(new AlarmRec { tag = tag, pos = go.transform.position, obj = go });
        }
    }
}
