using System.Collections.Generic;
using UnityEngine;

namespace WanniFront
{
    /// <summary>
    /// Loads the Blender-built models from Resources/Models, gives them proper
    /// Standard materials from materials.json, fixes axis/scale differences of
    /// the FBX import and adds colliders. Spawned objects are clones of templates.
    /// </summary>
    public static class Library
    {
        public const int UnitLayer = 30;
        public const int ViewModelLayer = 31;
        public const int IgnoreRaycastLayer = 2;

        // Static world only (terrain + props): used for line of sight
        public static int WorldMask => ~((1 << UnitLayer) | (1 << ViewModelLayer) | (1 << IgnoreRaycastLayer));
        // Everything a bullet can hit
        public static int ShotMask => ~((1 << ViewModelLayer) | (1 << IgnoreRaycastLayer));

        static readonly Dictionary<string, GameObject> templates = new Dictionary<string, GameObject>();
        static readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        static Dictionary<string, object> table;
        static Transform holder;
        static Quaternion correction = Quaternion.identity;
        static float scale = 1f;
        static bool ready;

        // trunk colliders for trees (radius, height); null = mesh collider; "none" = no collider
        static readonly Dictionary<string, Vector2> trunks = new Dictionary<string, Vector2>
        {
            { "palm_coconut", new Vector2(0.3f, 9f) },
            { "palm_palmyrah", new Vector2(0.3f, 12f) },
            { "tree_jungle", new Vector2(0.45f, 6f) },
        };
        static readonly HashSet<string> noCollider = new HashSet<string>
        {
            "bush", "soldier_army", "soldier_ltte", "civilian", "fp_t56", "fp_pistol", "fp_svd", "grenade",
        };

        public static void Init()
        {
            if (ready) return;
            ready = true;
            var go = new GameObject("[Model templates]");
            go.SetActive(false);
            Object.DontDestroyOnLoad(go);
            holder = go.transform;
            var json = Resources.Load<TextAsset>("materials");
            table = json != null ? MiniJson.Parse(json.text) as Dictionary<string, object> : new Dictionary<string, object>();
            if (json == null) Debug.LogWarning("Wanni Front: Resources/materials.json not found — run blender/build_assets.py");
            Calibrate();
        }

        // ------------------------------------------------------------ calibration

        static Bounds WorldBounds(GameObject g)
        {
            var rs = g.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(g.transform.position, Vector3.zero);
            var b = rs[0].bounds;
            foreach (var r in rs) b.Encapsulate(r.bounds);
            return b;
        }

        /// The FBX exporter/importer pair can rotate or scale models; measure the
        /// soldier (known: 1.8 m tall, rifle pointing forward) and correct for it.
        static void Calibrate()
        {
            var src = Resources.Load<GameObject>("Models/soldier_army");
            if (src == null) { Debug.LogError("Wanni Front: Resources/Models/soldier_army.fbx missing"); return; }
            var root = new GameObject("calibrate");
            var pivot = new GameObject("pivot").transform;
            pivot.SetParent(root.transform, false);
            var inst = Object.Instantiate(src, pivot, false);
            var head = Find(inst.transform, "Head");
            var leg = Find(inst.transform, "LegL");
            var muzzle = Find(inst.transform, "Muzzle");

            Quaternion[] candidates =
            {
                Quaternion.identity, Quaternion.Euler(-90, 0, 0), Quaternion.Euler(90, 0, 0),
                Quaternion.Euler(0, 0, 90), Quaternion.Euler(0, 0, -90), Quaternion.Euler(180, 0, 0),
            };
            Quaternion up = Quaternion.identity;
            foreach (var c in candidates)
            {
                pivot.localRotation = c;
                var b = WorldBounds(inst);
                bool tallest = b.size.y >= b.size.x && b.size.y >= b.size.z;
                bool headUp = head == null || leg == null || head.position.y > leg.position.y;
                if (tallest && headUp) { up = c; break; }
            }
            pivot.localRotation = up;
            float h = WorldBounds(inst).size.y;
            scale = h > 0.01f && Mathf.Abs(h / 1.8f - 1f) > 0.15f ? 1.8f / h : 1f;

            float yaw = 0;
            if (muzzle != null)
            {
                var m = root.transform.InverseTransformPoint(muzzle.position);
                float ang = Mathf.Atan2(m.x, m.z) * Mathf.Rad2Deg;
                yaw = -Mathf.Round(ang / 90f) * 90f;
            }
            correction = Quaternion.Euler(0, yaw, 0) * up;
            Object.DestroyImmediate(root);
        }

        // ------------------------------------------------------------ templates

        public static Transform Find(Transform t, string name)
        {
            if (t.name == name) return t;
            foreach (Transform c in t)
            {
                var r = Find(c, name);
                if (r != null) return r;
            }
            return null;
        }

        public static GameObject Template(string name)
        {
            Init();
            if (templates.TryGetValue(name, out var t)) return t;
            var root = new GameObject(name);
            root.transform.SetParent(holder, false);
            var src = Resources.Load<GameObject>("Models/" + name);
            if (src == null)
            {
                Debug.LogError("Wanni Front: missing model Resources/Models/" + name);
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.transform.SetParent(root.transform, false);
                cube.transform.localPosition = Vector3.up * 0.5f;
            }
            else
            {
                var pivot = new GameObject("pivot").transform;
                pivot.SetParent(root.transform, false);
                pivot.localRotation = correction;
                pivot.localScale = Vector3.one * scale;
                var m = Object.Instantiate(src, pivot, false);
                m.name = "model";
                ApplyMaterials(name, m);
                AddColliders(name, root);
            }
            templates[name] = root;
            return root;
        }

        public static GameObject Spawn(string name, Vector3 pos, float yawDeg = 0, float size = 1, Transform parent = null)
        {
            var go = Object.Instantiate(Template(name), pos, Quaternion.Euler(0, yawDeg, 0), parent);
            go.name = name;
            go.transform.localScale = Vector3.one * size;
            return go;
        }

        static void AddColliders(string name, GameObject root)
        {
            if (noCollider.Contains(name)) return;
            if (trunks.TryGetValue(name, out var trunk))
            {
                var cap = root.AddComponent<CapsuleCollider>();
                cap.radius = trunk.x;
                cap.height = trunk.y;
                cap.center = new Vector3(0, trunk.y / 2, 0);
                return;
            }
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>())
            {
                var mc = mf.gameObject.AddComponent<MeshCollider>();
                mc.sharedMesh = mf.sharedMesh;
            }
        }

        // ------------------------------------------------------------ materials

        static void ApplyMaterials(string model, GameObject go)
        {
            table.TryGetValue(model, out var entry);
            var mats = entry as Dictionary<string, object>;
            foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            {
                var arr = r.sharedMaterials;
                for (int i = 0; i < arr.Length; i++)
                {
                    string n = arr[i] != null ? arr[i].name.Replace(" (Instance)", "") : "";
                    Dictionary<string, object> info = null;
                    if (mats != null)
                    {
                        if (mats.TryGetValue(n, out var v)) info = v as Dictionary<string, object>;
                        else
                        {
                            // Blender may suffix duplicates (.001); match on the base name
                            foreach (var kv in mats)
                                if (n.StartsWith(kv.Key)) { info = kv.Value as Dictionary<string, object>; n = kv.Key; break; }
                        }
                    }
                    if (info != null) arr[i] = GetMaterial(model + "/" + n, n, info);
                    else if (arr[i] != null) arr[i].enableInstancing = true;
                }
                r.sharedMaterials = arr;
            }
        }

        static Material GetMaterial(string key, string name, Dictionary<string, object> info)
        {
            if (materials.TryGetValue(key, out var m)) return m;
            m = new Material(Shader.Find("Standard")) { name = name, enableInstancing = true };
            ColorUtility.TryParseHtmlString(info["color"] as string, out var col);
            m.color = col;
            if (info.TryGetValue("texture", out var tex) && tex is string texName)
            {
                var t = Resources.Load<Texture2D>("Textures/" + texName);
                if (t != null) { m.mainTexture = t; m.color = Color.white; }
            }
            float rough = System.Convert.ToSingle(info["roughness"]);
            float metal = System.Convert.ToSingle(info["metallic"]);
            m.SetFloat("_Glossiness", (1f - rough) * 0.85f);
            m.SetFloat("_Metallic", metal);
            materials[key] = m;
            return m;
        }

        /// A unique copy of a material on one object (used to tint civilians).
        public static void Tint(GameObject go, string materialName, Color color)
        {
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                var arr = r.sharedMaterials;
                bool changed = false;
                for (int i = 0; i < arr.Length; i++)
                {
                    if (arr[i] != null && arr[i].name == materialName)
                    {
                        arr[i] = new Material(arr[i]) { name = materialName + "_tinted" };
                        arr[i].color = color;
                        arr[i].mainTexture = null;
                        changed = true;
                    }
                }
                if (changed) r.sharedMaterials = arr;
            }
        }

        public static void SetLayer(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform c in go.transform) SetLayer(c.gameObject, layer);
        }

        public static Material ParticleMaterial(bool additive, Texture tex)
        {
            var sh = Shader.Find(additive ? "Legacy Shaders/Particles/Additive" : "Legacy Shaders/Particles/Alpha Blended")
                     ?? Shader.Find("Particles/Standard Unlit") ?? Shader.Find("Sprites/Default");
            var m = new Material(sh) { mainTexture = tex };
            if (m.HasProperty("_TintColor")) m.SetColor("_TintColor", new Color(0.5f, 0.5f, 0.5f, 0.5f));
            return m;
        }

        static Texture2D softDot;
        public static Texture2D SoftDot
        {
            get
            {
                if (softDot != null) return softDot;
                const int N = 64;
                softDot = new Texture2D(N, N, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(N / 2f, N / 2f)) / (N / 2f);
                    float a = Mathf.Clamp01(1 - d);
                    softDot.SetPixel(x, y, new Color(1, 1, 1, a * a));
                }
                softDot.Apply();
                return softDot;
            }
        }
    }
}
