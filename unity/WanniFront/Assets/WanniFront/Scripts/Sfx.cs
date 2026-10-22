using UnityEngine;

namespace WanniFront
{
    /// <summary>All sound effects are synthesised at start-up, so the project needs no audio files.</summary>
    public class Sfx : MonoBehaviour
    {
        public static Sfx I;
        const int Rate = 44100;

        public AudioClip rifle, pistol, sniper, distantShot, explosion, click, reload, hit, whiz, siren, rain, jungle, wind;
        public AudioClip[] steps;
        AudioSource[] pool;
        int next;
        AudioSource ui;
        AudioSource ambience, rainSrc, sirenSrc;
        System.Random rng = new System.Random(7);

        void Awake()
        {
            I = this;
            rifle = Shot("rifle", 0.32f, 0.9f, 140, 3500);
            pistol = Shot("pistol", 0.12f, 0.35f, 220, 1600);
            sniper = Shot("sniper", 0.9f, 1.0f, 90, 3000);
            distantShot = Shot("distant", 0.5f, 0.6f, 80, 900);
            explosion = Boom();
            click = Tick("click", 0.04f, 3000, 0.5f);
            reload = Reload();
            hit = Tick("hit", 0.05f, 5200, 0.4f);
            whiz = Whiz();
            siren = Siren();
            rain = NoiseLoop("rain", 4f, 0.25f, 0.35f);
            wind = NoiseLoop("wind", 6f, 0.02f, 0.25f);
            jungle = Jungle();
            steps = new[] { Step(1), Step(2), Step(3), Step(4) };

            pool = new AudioSource[24];
            for (int i = 0; i < pool.Length; i++)
            {
                var go = new GameObject("sfx" + i);
                go.transform.SetParent(transform);
                pool[i] = go.AddComponent<AudioSource>();
                pool[i].playOnAwake = false;
                pool[i].spatialBlend = 1;
                pool[i].rolloffMode = AudioRolloffMode.Logarithmic;
                pool[i].dopplerLevel = 0;
            }
            ui = gameObject.AddComponent<AudioSource>();
            ui.spatialBlend = 0;
            ambience = gameObject.AddComponent<AudioSource>();
            ambience.loop = true;
            ambience.spatialBlend = 0;
            rainSrc = gameObject.AddComponent<AudioSource>();
            rainSrc.loop = true;
            rainSrc.spatialBlend = 0;
            sirenSrc = gameObject.AddComponent<AudioSource>();
            sirenSrc.loop = true;
            sirenSrc.spatialBlend = 1;
            sirenSrc.minDistance = 15;
            sirenSrc.maxDistance = 400;
        }

        // ------------------------------------------------------------ playback

        public void Play2D(AudioClip c, float vol = 1f, float pitch = 1f)
        {
            if (c == null) return;
            ui.pitch = pitch;
            ui.PlayOneShot(c, vol);
        }

        public void Play3D(AudioClip c, Vector3 pos, float vol = 1f, float minDist = 4f, float maxDist = 300f, float pitch = 1f)
        {
            if (c == null) return;
            var s = pool[next];
            next = (next + 1) % pool.Length;
            s.transform.position = pos;
            s.clip = c;
            s.volume = vol;
            s.pitch = pitch;
            s.minDistance = minDist;
            s.maxDistance = maxDist;
            s.Play();
        }

        public void Gunshot(Vector3 pos, bool suppressed, bool sniperRifle, Vector3 listener)
        {
            float d = Vector3.Distance(pos, listener);
            if (suppressed) Play3D(pistol, pos, 0.8f, 2, 40);
            else if (d > 120) Play3D(distantShot, pos, 1f, 30, 800, Random.Range(0.9f, 1.1f));
            else Play3D(sniperRifle ? sniper : rifle, pos, 1f, 6, 600, Random.Range(0.92f, 1.08f));
        }

        public void SetAmbience(bool jungleSounds, bool raining)
        {
            ambience.clip = jungleSounds ? jungle : wind;
            ambience.volume = jungleSounds ? 0.35f : 0.25f;
            ambience.Play();
            rainSrc.clip = rain;
            rainSrc.volume = 0.5f;
            if (raining) rainSrc.Play(); else rainSrc.Stop();
        }

        public void StopAll()
        {
            ambience.Stop();
            rainSrc.Stop();
            sirenSrc.Stop();
        }

        public void Siren(Vector3 pos, bool on)
        {
            sirenSrc.transform.position = pos;
            sirenSrc.clip = siren;
            if (on && !sirenSrc.isPlaying) sirenSrc.Play();
            if (!on) sirenSrc.Stop();
        }

        // ------------------------------------------------------------ synthesis

        float Rnd() => (float)rng.NextDouble() * 2f - 1f;

        AudioClip Make(string name, float[] data)
        {
            var c = AudioClip.Create(name, data.Length, 1, Rate, false);
            c.SetData(data, 0);
            return c;
        }

        // gunshot: sharp noise crack + low thump with a low-passed tail
        AudioClip Shot(string name, float len, float crack, float thumpHz, float cutoff)
        {
            int n = (int)(Rate * len);
            var d = new float[n];
            float lp = 0, a = Mathf.Clamp01(cutoff / Rate * 6.28f);
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float env = Mathf.Exp(-t * (10f / len));
                float noise = Rnd();
                lp += (noise - lp) * a;
                float crackEnv = Mathf.Exp(-t * 90f) * crack;
                float thump = Mathf.Sin(2 * Mathf.PI * thumpHz * t * (1 - t * 2)) * Mathf.Exp(-t * 25f);
                d[i] = Mathf.Clamp(lp * env * 1.4f + noise * crackEnv * 0.6f + thump * 0.8f, -1, 1);
            }
            return Make(name, d);
        }

        AudioClip Boom()
        {
            int n = Rate * 3;
            var d = new float[n];
            float lp = 0, lp2 = 0;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                lp += (Rnd() - lp) * 0.04f;
                lp2 += (lp - lp2) * 0.1f;
                float env = Mathf.Exp(-t * 1.6f) * Mathf.Clamp01(t * 200f);
                float thump = Mathf.Sin(2 * Mathf.PI * 45 * t) * Mathf.Exp(-t * 6f);
                d[i] = Mathf.Clamp((lp2 * 6f + thump) * env, -1, 1);
            }
            return Make("explosion", d);
        }

        AudioClip Tick(string name, float len, float hz, float vol)
        {
            int n = (int)(Rate * len);
            var d = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                d[i] = (Mathf.Sin(2 * Mathf.PI * hz * t) * 0.5f + Rnd() * 0.5f) * Mathf.Exp(-t * 120f) * vol;
            }
            return Make(name, d);
        }

        AudioClip Reload()
        {
            int n = (int)(Rate * 1.6f);
            var d = new float[n];
            float[] at = { 0.1f, 0.55f, 1.25f, 1.38f };
            foreach (var s in at)
            {
                int start = (int)(s * Rate);
                for (int i = 0; i < Rate * 0.06f && start + i < n; i++)
                {
                    float t = (float)i / Rate;
                    d[start + i] += (Rnd() * 0.6f + Mathf.Sin(2 * Mathf.PI * 1800 * t) * 0.4f) * Mathf.Exp(-t * 80f) * 0.6f;
                }
            }
            return Make("reload", d);
        }

        AudioClip Whiz()
        {
            int n = (int)(Rate * 0.25f);
            var d = new float[n];
            float lp = 0;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                lp += (Rnd() - lp) * 0.3f;
                d[i] = lp * Mathf.Sin(Mathf.PI * t / 0.25f) * 0.5f;
            }
            return Make("whiz", d);
        }

        AudioClip Siren()
        {
            int n = Rate * 4;
            var d = new float[n];
            float phase = 0;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float f = 600 + 350 * Mathf.Sin(2 * Mathf.PI * t / 4f * 2f);
                phase += 2 * Mathf.PI * f / Rate;
                d[i] = (Mathf.Sin(phase) > 0 ? 0.35f : -0.35f) * 0.6f + Mathf.Sin(phase) * 0.2f;
            }
            return Make("siren", d);
        }

        AudioClip NoiseLoop(string name, float len, float cut, float vol)
        {
            int n = (int)(Rate * len);
            var d = new float[n];
            float lp = 0;
            for (int i = 0; i < n; i++)
            {
                lp += (Rnd() - lp) * cut;
                d[i] = lp * vol * 3f;
            }
            // cross-fade the ends so the loop is seamless
            int fade = Rate / 4;
            for (int i = 0; i < fade; i++)
            {
                float k = (float)i / fade;
                d[i] = d[i] * k + d[n - fade + i] * (1 - k);
            }
            System.Array.Resize(ref d, n - fade);
            return Make(name, d);
        }

        AudioClip Jungle()
        {
            int n = Rate * 8;
            var d = new float[n];
            // cicada trill bed
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float trill = Mathf.Sin(2 * Mathf.PI * 4200 * t) * (0.5f + 0.5f * Mathf.Sin(2 * Mathf.PI * 38 * t));
                float swell = 0.5f + 0.5f * Mathf.Sin(2 * Mathf.PI * t / 8f);
                d[i] = trill * 0.05f * swell + Rnd() * 0.01f;
            }
            // bird calls
            for (int b = 0; b < 9; b++)
            {
                int start = rng.Next(0, n - Rate);
                float f0 = 1800 + (float)rng.NextDouble() * 1800;
                for (int c = 0; c < 3; c++)
                {
                    int s0 = start + c * Rate / 6;
                    float phase = 0;
                    for (int i = 0; i < Rate / 10 && s0 + i < n; i++)
                    {
                        float t = (float)i / Rate;
                        phase += 2 * Mathf.PI * (f0 + 900 * Mathf.Sin(t * 60)) / Rate;
                        d[s0 + i] += Mathf.Sin(phase) * Mathf.Sin(Mathf.PI * t * 10) * 0.12f;
                    }
                }
            }
            return Make("jungle", d);
        }

        AudioClip Step(int seed)
        {
            int n = (int)(Rate * 0.12f);
            var d = new float[n];
            float lp = 0;
            var r = new System.Random(seed);
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                lp += ((float)r.NextDouble() * 2 - 1 - lp) * 0.15f;
                d[i] = lp * Mathf.Exp(-t * 45f) * 1.2f;
            }
            return Make("step" + seed, d);
        }
    }
}
