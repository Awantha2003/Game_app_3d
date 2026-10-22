using System.Collections.Generic;
using UnityEngine;

namespace WanniFront
{
    /// <summary>Particles, tracers, muzzle flashes and explosions.</summary>
    public class Fx : MonoBehaviour
    {
        public static Fx I;
        ParticleSystem dust, splash, fire, smoke, flash, blood;
        readonly List<(LineRenderer line, float t)> tracers = new List<(LineRenderer, float)>();
        readonly Queue<LineRenderer> freeTracers = new Queue<LineRenderer>();
        Light flashLight;
        float flashTime;
        Material tracerMat;
        public float Shake;

        void Awake()
        {
            I = this;
            var dot = Library.SoftDot;
            dust = Make("dust", false, dot, new Color(0.62f, 0.55f, 0.42f, 0.8f), 1.2f, 0.4f, 1.5f, 0.3f);
            splash = Make("splash", false, dot, new Color(0.85f, 0.92f, 0.95f, 0.8f), 0.9f, 0.3f, 4f, 1.2f);
            fire = Make("fire", true, dot, new Color(1f, 0.6f, 0.2f, 1f), 0.6f, 3.5f, 8f, 0f);
            smoke = Make("smoke", false, dot, new Color(0.25f, 0.24f, 0.22f, 0.7f), 5f, 4f, 3f, -0.05f);
            flash = Make("flash", true, dot, new Color(1f, 0.85f, 0.5f, 1f), 0.05f, 0.7f, 0f, 0f);
            blood = Make("hit", false, dot, new Color(0.35f, 0.08f, 0.05f, 0.9f), 0.5f, 0.25f, 1.2f, 0.6f);

            flashLight = new GameObject("flashLight").AddComponent<Light>();
            flashLight.transform.SetParent(transform);
            flashLight.type = LightType.Point;
            flashLight.range = 10;
            flashLight.color = new Color(1f, 0.7f, 0.35f);
            flashLight.intensity = 0;
            flashLight.shadows = LightShadows.None;

            tracerMat = Library.ParticleMaterial(true, dot);
        }

        ParticleSystem Make(string name, bool additive, Texture tex, Color col, float life, float size, float speed, float gravity)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = false;
            main.playOnAwake = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(life * 0.6f, life);
            main.startSize = new ParticleSystem.MinMaxCurve(size * 0.6f, size);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed * 0.4f, speed);
            main.startColor = col;
            main.gravityModifier = gravity;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 2000;
            var em = ps.emission;
            em.enabled = false;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 0.1f;
            var sol = ps.sizeOverLifetime;
            sol.enabled = true;
            sol.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.6f, 1, 1.6f));
            var col2 = ps.colorOverLifetime;
            col2.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(0, 1) });
            col2.color = g;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.material = Library.ParticleMaterial(additive, tex);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return ps;
        }

        static void Emit(ParticleSystem ps, Vector3 pos, int count, Vector3? normal = null)
        {
            var ep = new ParticleSystem.EmitParams { position = pos, applyShapeToPosition = true };
            if (normal.HasValue)
            {
                for (int i = 0; i < count; i++)
                {
                    ep.velocity = (normal.Value + Random.insideUnitSphere * 0.6f).normalized * Random.Range(0.5f, 2.5f);
                    ps.Emit(ep, 1);
                }
            }
            else ps.Emit(ep, count);
        }

        public void Impact(Vector3 pos, Vector3 normal, bool water)
        {
            if (water) Emit(splash, pos, 10, Vector3.up);
            else Emit(dust, pos, 6, normal);
        }

        public void HitUnit(Vector3 pos) => Emit(blood, pos, 5);

        public void MuzzleFlash(Vector3 pos)
        {
            Emit(flash, pos, 1);
            flashLight.transform.position = pos;
            flashLight.intensity = 3;
            flashTime = 0.05f;
        }

        public void Explosion(Vector3 pos, float scale = 1f)
        {
            Emit(fire, pos + Vector3.up * 0.5f, (int)(30 * scale));
            Emit(smoke, pos + Vector3.up, (int)(25 * scale));
            Emit(dust, pos, (int)(30 * scale), Vector3.up);
            flashLight.transform.position = pos + Vector3.up * 2;
            flashLight.intensity = 8 * scale;
            flashLight.range = 30;
            flashTime = 0.25f;
        }

        public void Tracer(Vector3 from, Vector3 to, Color color)
        {
            var dir = to - from;
            float len = dir.magnitude;
            if (len < 2) return;
            dir /= len;
            var a = from + dir * Random.Range(1f, Mathf.Min(10f, len * 0.4f));
            var b = a + dir * Mathf.Min(8f, len * 0.5f);
            LineRenderer lr = freeTracers.Count > 0 ? freeTracers.Dequeue() : NewTracer();
            lr.gameObject.SetActive(true);
            lr.SetPosition(0, a);
            lr.SetPosition(1, b);
            lr.startColor = lr.endColor = color;
            tracers.Add((lr, 0.05f));
        }

        LineRenderer NewTracer()
        {
            var go = new GameObject("tracer");
            go.transform.SetParent(transform);
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = 2;
            lr.startWidth = 0.035f;
            lr.endWidth = 0.02f;
            lr.material = tracerMat;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return lr;
        }

        void Update()
        {
            for (int i = tracers.Count - 1; i >= 0; i--)
            {
                var (lr, t) = tracers[i];
                t -= Time.deltaTime;
                if (t <= 0)
                {
                    lr.gameObject.SetActive(false);
                    freeTracers.Enqueue(lr);
                    tracers.RemoveAt(i);
                }
                else tracers[i] = (lr, t);
            }
            if (flashTime > 0)
            {
                flashTime -= Time.deltaTime;
                if (flashTime <= 0) { flashLight.intensity = 0; flashLight.range = 10; }
            }
            Shake = Mathf.Max(0, Shake - Time.deltaTime * 1.5f);
        }

        public void Clear()
        {
            foreach (var ps in new[] { dust, splash, fire, smoke, flash, blood }) ps.Clear();
        }
    }
}
