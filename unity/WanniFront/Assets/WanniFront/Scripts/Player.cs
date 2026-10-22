using UnityEngine;

namespace WanniFront
{
    public class Weapon
    {
        public string name, model;
        public int mag, magSize, reserve, maxReserve;
        public float interval, damage, spreadHip, spreadAds, recoil, adsFov, noise, reloadTime;
        public bool auto, suppressed, scope;
        public Transform vm, muzzle;
        public Vector3 sightOffset;
    }

    /// <summary>First-person player: movement, stances, weapons, binoculars, grenades and health.</summary>
    public class Player : MonoBehaviour, ICombatant
    {
        public enum Stance { Stand, Crouch, Prone }

        public Stance CurrentStance = Stance.Stand;
        public Camera cam;
        public float hp = 100;
        public int medkits = 2, grenades = 4;
        public bool binoculars;
        public float aimK;
        public float interactProgress;
        public string prompt;
        public float hitMarkerT;
        public bool hitMarkerKill;
        public float damageT;
        public Vector3 damageFrom;
        public float breath = 1;
        public Weapon[] weapons;
        public int current;

        CharacterController cc;
        Camera vmCam;
        Transform vmRoot;
        float yaw, pitch, vy, eye = 1.65f, bobT, stepT, fireT, reloadT, switchT, bloom, kick, deathT;
        float scopeSwayT;
        bool alive = true, firedThisPress;
        Vector3 hip = new Vector3(0.16f, -0.2f, 0.3f);
        Vector2 swayV;
        float speedNow;
        bool sprinting;

        static GameManager G => GameManager.I;
        public Weapon W => weapons[current];

        // ------------------------------------------------------------ ICombatant

        public Vector3 Position => transform.position;
        public Vector3 AimPoint => transform.position + Vector3.up * (CurrentStance == Stance.Prone ? 0.3f : CurrentStance == Stance.Crouch ? 0.85f : 1.3f);
        public bool Alive => alive;
        public Team Side => Team.Army;
        public Vector3 Forward => Quaternion.Euler(0, yaw, 0) * Vector3.forward;
        public float Speed => speedNow;
        public bool Scoped => alive && W.scope && aimK > 0.9f && !binoculars;
        public bool Reloading => reloadT > 0;

        public float Exposure
        {
            get
            {
                float e = CurrentStance == Stance.Stand ? 1f : CurrentStance == Stance.Crouch ? 0.6f : 0.3f;
                if (sprinting) e *= 1.4f;
                else if (speedNow < 0.2f) e *= 0.8f;
                return e;
            }
        }

        // ------------------------------------------------------------ setup

        public static Player Create(Vector3 pos, float yaw, Camera camera)
        {
            var go = new GameObject("Player");
            go.layer = Library.IgnoreRaycastLayer;
            go.transform.position = pos + Vector3.up * 0.1f;
            var p = go.AddComponent<Player>();
            p.yaw = yaw;
            p.cam = camera;
            p.Setup();
            return p;
        }

        void Setup()
        {
            cc = gameObject.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0, 0.9f, 0);
            cc.stepOffset = 0.45f;
            cc.slopeLimit = 55;

            cam.transform.SetParent(transform, false);
            cam.transform.localPosition = new Vector3(0, eye, 0);
            cam.transform.localRotation = Quaternion.identity;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 1200;
            cam.fieldOfView = 70;
            cam.cullingMask &= ~(1 << Library.ViewModelLayer);

            var vmGo = new GameObject("ViewModelCamera");
            vmGo.transform.SetParent(cam.transform, false);
            vmCam = vmGo.AddComponent<Camera>();
            vmCam.clearFlags = CameraClearFlags.Depth;
            vmCam.cullingMask = 1 << Library.ViewModelLayer;
            vmCam.depth = cam.depth + 1;
            vmCam.fieldOfView = 55;
            vmCam.nearClipPlane = 0.01f;
            vmCam.farClipPlane = 5;

            vmRoot = new GameObject("ViewModel").transform;
            vmRoot.SetParent(cam.transform, false);

            weapons = new[]
            {
                new Weapon { name = "T-56 Assault Rifle", model = "fp_t56", magSize = 30, maxReserve = 180, interval = 0.1f, damage = 38, spreadHip = 2.2f, spreadAds = 0.45f, recoil = 1.0f, adsFov = 50, noise = 90, reloadTime = 2.4f, auto = true },
                new Weapon { name = "Pistol (suppressed)", model = "fp_pistol", magSize = 8, maxReserve = 48, interval = 0.22f, damage = 34, spreadHip = 2.0f, spreadAds = 0.7f, recoil = 1.6f, adsFov = 58, noise = 9, reloadTime = 1.7f, suppressed = true },
                new Weapon { name = "SVD Sniper Rifle", model = "fp_svd", magSize = 10, maxReserve = 30, interval = 0.45f, damage = 130, spreadHip = 4.5f, spreadAds = 0.03f, recoil = 4.0f, adsFov = 8, noise = 140, reloadTime = 3.0f, scope = true },
            };
            foreach (var w in weapons)
            {
                w.mag = w.magSize;
                w.reserve = w.maxReserve;
                var go = Library.Spawn(w.model, Vector3.zero, 0, 1, vmRoot);
                go.transform.localPosition = Vector3.zero;
                go.transform.localRotation = Quaternion.identity;
                Library.SetLayer(go, Library.ViewModelLayer);
                foreach (var r in go.GetComponentsInChildren<Renderer>())
                {
                    r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    r.receiveShadows = false;
                }
                w.vm = go.transform;
                w.muzzle = Library.Find(go.transform, "Muzzle");
                var sight = Library.Find(go.transform, "Sight");
                w.sightOffset = sight != null ? vmRoot.InverseTransformPoint(sight.position) : new Vector3(0, 0.1f, 0);
                go.SetActive(false);
            }
            weapons[0].vm.gameObject.SetActive(true);
        }

        // ------------------------------------------------------------ damage

        public void Damage(float amount, Vector3 from, bool head)
        {
            if (!alive) return;
            hp -= amount * Mathf.Lerp(0.6f, 1.3f, (G.difficulty - 0.6f) / 0.85f);
            damageT = 1;
            damageFrom = from;
            Fx.I.Shake = Mathf.Max(Fx.I.Shake, 0.25f);
            if (hp <= 0)
            {
                hp = 0;
                alive = false;
                G.MissionFailed("You were killed in action.");
            }
        }

        public void NearMiss()
        {
            if (Random.value < 0.4f) Sfx.I.Play2D(Sfx.I.whiz, 0.4f, Random.Range(0.8f, 1.3f));
        }

        public void Resupply()
        {
            foreach (var w in weapons) w.reserve = w.maxReserve;
            medkits = Mathf.Max(medkits, 2);
            grenades = Mathf.Max(grenades, 4);
        }

        public void Teleport(Vector3 pos)
        {
            cc.enabled = false;
            transform.position = pos;
            cc.enabled = true;
            vy = 0;
        }

        // ------------------------------------------------------------ update

        void Update()
        {
            if (G == null || !G.Playing) return;
            float dt = Time.deltaTime;
            if (!alive)
            {
                deathT += dt;
                cam.transform.localPosition = Vector3.Lerp(cam.transform.localPosition, new Vector3(0, 0.3f, 0), dt * 3);
                cam.transform.localRotation = Quaternion.Slerp(cam.transform.localRotation, Quaternion.Euler(-10, 0, 70), dt * 3);
                vmRoot.gameObject.SetActive(false);
                return;
            }
            Look(dt);
            Stances(dt);
            Movement(dt);
            WeaponInput(dt);
            ViewModel(dt);
            Interaction(dt);
            if (GameInput.KeyDown(KeyCode.H) && medkits > 0 && hp < 100)
            {
                medkits--;
                hp = Mathf.Min(100, hp + 50);
                G.Toast("Field dressing applied (+50)");
            }
            damageT = Mathf.Max(0, damageT - dt * 0.8f);
            hitMarkerT = Mathf.Max(0, hitMarkerT - dt);
        }

        void Look(float dt)
        {
            var l = GameInput.Look;
            float zoom = cam.fieldOfView / 70f;
            yaw += l.x * zoom;
            pitch = Mathf.Clamp(pitch + l.y * zoom, -85, 85);

            // sniper scope sway, steadied by holding breath (Shift)
            float sx = 0, sy = 0;
            if (Scoped)
            {
                bool hold = GameInput.Key(KeyCode.LeftShift) && breath > 0;
                breath = hold ? breath - dt / 4f : Mathf.Min(1, breath + dt / 6f);
                float amp = hold ? 0.05f : breath <= 0 ? 1.0f : 0.45f;
                if (CurrentStance == Stance.Prone) amp *= 0.4f;
                scopeSwayT += dt;
                sx = (Mathf.PerlinNoise(scopeSwayT * 0.6f, 0) - 0.5f) * amp * 2;
                sy = (Mathf.PerlinNoise(0, scopeSwayT * 0.6f) - 0.5f) * amp * 2;
            }
            else breath = Mathf.Min(1, breath + dt / 6f);

            kick = Mathf.Lerp(kick, 0, dt * 10);
            transform.rotation = Quaternion.Euler(0, yaw + sx, 0);
            float shake = Fx.I.Shake;
            cam.transform.localRotation = Quaternion.Euler(-(pitch + kick + sy) + Random.Range(-shake, shake), Random.Range(-shake, shake), 0);
        }

        void Stances(float dt)
        {
            if (GameInput.KeyDown(KeyCode.C)) CurrentStance = CurrentStance == Stance.Crouch ? Stance.Stand : Stance.Crouch;
            if (GameInput.KeyDown(KeyCode.Z)) CurrentStance = CurrentStance == Stance.Prone ? Stance.Stand : Stance.Prone;
            if (CurrentStance != Stance.Stand && GameInput.KeyDown(KeyCode.Space)) CurrentStance = Stance.Stand;
            // do not stand up under something
            if (CurrentStance == Stance.Stand && cc.height < 1.7f &&
                Physics.Raycast(transform.position + Vector3.up * 0.2f, Vector3.up, 1.7f, Library.WorldMask, QueryTriggerInteraction.Ignore))
                CurrentStance = Stance.Crouch;
            float h = CurrentStance == Stance.Stand ? 1.8f : CurrentStance == Stance.Crouch ? 1.2f : 0.6f;
            float e = CurrentStance == Stance.Stand ? 1.65f : CurrentStance == Stance.Crouch ? 1.05f : 0.4f;
            cc.radius = CurrentStance == Stance.Prone ? 0.3f : 0.35f;
            cc.height = Mathf.MoveTowards(cc.height, h, dt * 3);
            cc.center = new Vector3(0, cc.height / 2, 0);
            eye = Mathf.MoveTowards(eye, e, dt * 3);
        }

        void Movement(float dt)
        {
            var mv = GameInput.Move;
            bool aiming = GameInput.Aim && reloadT <= 0;
            sprinting = GameInput.Key(KeyCode.LeftShift) && mv.y > 0 && !aiming && CurrentStance == Stance.Stand && !Scoped;
            float spd = CurrentStance == Stance.Prone ? 0.9f : CurrentStance == Stance.Crouch ? 2.1f : sprinting ? 6.4f : 3.7f;
            if (aiming) spd *= 0.6f;
            if (binoculars) spd *= 0.5f;
            var dir = transform.forward * mv.y + transform.right * mv.x;
            if (dir.sqrMagnitude > 1) dir.Normalize();
            var horiz = dir * spd;
            var next = transform.position + horiz * dt;
            if (G.world.IsWater(next.x, next.z, 0.9f)) horiz = Vector3.zero;

            if (cc.isGrounded)
            {
                vy = -1;
                if (CurrentStance == Stance.Stand && GameInput.KeyDown(KeyCode.Space)) vy = 4.8f;
            }
            else vy -= 18 * dt;
            var start = transform.position;
            cc.Move((horiz + Vector3.up * vy) * dt);
            var d = transform.position - start;
            d.y = 0;
            speedNow = d.magnitude / Mathf.Max(dt, 1e-4f);

            // head bob, footsteps and the noise they make
            if (cc.isGrounded && speedNow > 0.3f)
            {
                bobT += dt * speedNow * 1.8f;
                stepT += speedNow * dt;
                float stride = sprinting ? 2.4f : CurrentStance == Stance.Prone ? 1.2f : 1.8f;
                if (stepT > stride)
                {
                    stepT = 0;
                    float vol = sprinting ? 0.5f : CurrentStance == Stance.Stand ? 0.3f : 0.15f;
                    Sfx.I.Play2D(Sfx.I.steps[Random.Range(0, Sfx.I.steps.Length)], vol, Random.Range(0.9f, 1.1f));
                    float r = sprinting ? 16 : CurrentStance == Stance.Stand ? 7 : CurrentStance == Stance.Crouch ? 3 : 1.2f;
                    G.MakeNoise(transform.position, r, false);
                }
            }
            float bob = Mathf.Sin(bobT) * 0.035f * Mathf.Clamp01(speedNow / 4) * (1 - aimK * 0.8f);
            cam.transform.localPosition = new Vector3(Mathf.Cos(bobT * 0.5f) * bob * 0.6f, eye + bob, 0);
        }

        void WeaponInput(float dt)
        {
            fireT -= dt;
            bloom = Mathf.Max(0, bloom - dt * 3f);

            if (switchT > 0) { switchT -= dt; return; }
            if (GameInput.KeyDown(KeyCode.B)) { binoculars = !binoculars; Sfx.I.Play2D(Sfx.I.click, 0.4f); }
            int want = current;
            if (GameInput.KeyDown(KeyCode.Alpha1)) want = 0;
            if (GameInput.KeyDown(KeyCode.Alpha2)) want = 1;
            if (GameInput.KeyDown(KeyCode.Alpha3)) want = 2;
            float sc = GameInput.Scroll;
            if (sc != 0) want = (current + (sc > 0 ? weapons.Length - 1 : 1)) % weapons.Length;
            if (want != current) { Switch(want); return; }

            if (GameInput.KeyDown(KeyCode.G) && grenades > 0 && !binoculars) ThrowGrenade();

            if (reloadT > 0)
            {
                reloadT -= dt;
                if (reloadT <= 0)
                {
                    int take = Mathf.Min(W.magSize - W.mag, W.reserve);
                    W.mag += take;
                    W.reserve -= take;
                }
            }
            else if ((GameInput.KeyDown(KeyCode.R) || (W.mag == 0 && GameInput.FireDown)) && W.mag < W.magSize && W.reserve > 0)
            {
                reloadT = W.reloadTime;
                binoculars = false;
                Sfx.I.Play2D(Sfx.I.reload, 0.6f, 1.6f / W.reloadTime);
            }

            bool wantAim = GameInput.Aim && reloadT <= 0 && !sprinting && !binoculars;
            aimK = Mathf.MoveTowards(aimK, wantAim ? 1 : 0, dt * (W.scope ? 4 : 6));
            float fov = binoculars ? 7 : Mathf.Lerp(70, W.adsFov, aimK);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov, dt * 14);

            if (binoculars) { MarkWithBinoculars(); return; }
            if (!GameInput.Fire) firedThisPress = false;
            bool trigger = W.auto ? GameInput.Fire : GameInput.Fire && !firedThisPress;
            if (trigger && fireT <= 0 && reloadT <= 0 && !sprinting)
            {
                if (W.mag > 0) Fire();
                else { Sfx.I.Play2D(Sfx.I.click, 0.5f); fireT = 0.3f; }
                firedThisPress = true;
            }
        }

        void Switch(int i)
        {
            W.vm.gameObject.SetActive(false);
            current = i;
            W.vm.gameObject.SetActive(true);
            reloadT = 0;
            switchT = 0.45f;
            aimK = 0;
            binoculars = false;
            Sfx.I.Play2D(Sfx.I.click, 0.5f, 0.8f);
        }

        void Fire()
        {
            W.mag--;
            fireT = W.interval;
            float spread = Mathf.Lerp(W.spreadHip, W.spreadAds, aimK) + bloom;
            if (speedNow > 0.5f) spread += 1.5f * (1 - aimK * 0.7f);
            if (CurrentStance == Stance.Crouch) spread *= 0.75f;
            if (CurrentStance == Stance.Prone) spread *= 0.5f;
            bloom = Mathf.Min(3f, bloom + W.recoil * 0.35f);

            var r = Random.insideUnitCircle * spread;
            var aimDir = cam.transform.forward;
            var dir = cam.transform.rotation * Quaternion.Euler(r.y, r.x, 0) * Vector3.forward;
            var origin = cam.transform.position;
            var muzzle = W.muzzle != null ? W.muzzle.position : origin + dir * 0.6f;

            Vector3 end = origin + dir * 1000;
            if (Physics.Raycast(origin, dir, out var hit, 1000, Library.ShotMask, QueryTriggerInteraction.Ignore))
            {
                end = hit.point;
                var u = hit.collider.GetComponentInParent<Unit>();
                if (u != null && u.Alive)
                {
                    if (u.team == Team.Civilian)
                    {
                        // only a shot aimed straight at a civilian hurts them; stray rounds are a warning
                        if (Physics.Raycast(origin, aimDir, out var aimed, 1000, Library.ShotMask, QueryTriggerInteraction.Ignore)
                            && aimed.collider.GetComponentInParent<Unit>() == u)
                        {
                            u.killedByPlayer = true;
                            u.Damage(40, transform.position, false);
                        }
                        if (u.Alive) G.Toast("HOLD FIRE — civilians!");
                    }
                    else if (u.team == Team.Army) G.Toast("Check your fire — friendly!");
                    else
                    {
                        bool head = hit.point.y > u.Position.y + u.HeadHeight;
                        u.killedByPlayer = true;
                        u.Damage(head ? W.damage * 3.5f : W.damage, transform.position, head);
                        Fx.I.HitUnit(hit.point);
                        hitMarkerT = 0.15f;
                        hitMarkerKill = !u.Alive;
                        Sfx.I.Play2D(Sfx.I.hit, 0.35f);
                        G.shotsHit++;
                    }
                }
                else
                {
                    bool water = false;
                    if (G.world.def.HasWater && dir.y < 0)
                    {
                        float t = (G.world.def.water - origin.y) / dir.y;
                        if (t > 0 && t < hit.distance) { end = origin + dir * t; water = true; }
                    }
                    Fx.I.Impact(end, water ? Vector3.up : hit.normal, water);
                }
            }
            G.shotsFired++;
            if (!W.suppressed) Fx.I.MuzzleFlash(muzzle);
            if (!W.suppressed || Random.value < 0.3f) Fx.I.Tracer(muzzle, end, new Color(1f, 0.95f, 0.6f));
            Sfx.I.Play2D(W.suppressed ? Sfx.I.pistol : W.scope ? Sfx.I.sniper : Sfx.I.rifle, W.suppressed ? 0.6f : 0.8f, Random.Range(0.95f, 1.05f));
            G.MakeNoise(transform.position, W.noise, true);
            pitch += W.recoil * (CurrentStance == Stance.Prone ? 0.4f : 0.7f) * (W.scope ? 0.6f : 1f);
            yaw += Random.Range(-0.3f, 0.3f) * W.recoil;
            kick += W.recoil * 0.6f;
            if (W.vm != null) W.vm.localPosition += new Vector3(0, 0.005f, -0.03f) * W.recoil;
        }

        void ThrowGrenade()
        {
            grenades--;
            var pos = cam.transform.position + cam.transform.forward * 0.6f + Vector3.down * 0.1f;
            var go = Library.Spawn("grenade", pos, 0);
            go.layer = Library.IgnoreRaycastLayer;
            var col = go.AddComponent<SphereCollider>();
            col.radius = 0.06f;
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = 0.4f;
            rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
            rb.AddForce(cam.transform.forward * 15 + Vector3.up * 3, ForceMode.VelocityChange);
            rb.AddTorque(Random.insideUnitSphere * 5, ForceMode.VelocityChange);
            go.AddComponent<Grenade>();
            Physics.IgnoreCollision(col, cc);
            G.Toast("Grenade out!");
        }

        void MarkWithBinoculars()
        {
            foreach (var u in G.units)
            {
                if (!u.Alive || u.team != Team.LTTE || u.marked) continue;
                var to = u.AimPoint - cam.transform.position;
                if (Vector3.Angle(cam.transform.forward, to) > 2.5f || to.magnitude > 400) continue;
                if (Physics.Linecast(cam.transform.position, u.AimPoint, Library.WorldMask, QueryTriggerInteraction.Ignore)) continue;
                u.marked = true;
                G.Toast("Hostile marked");
                Sfx.I.Play2D(Sfx.I.hit, 0.3f, 1.4f);
            }
        }

        void ViewModel(float dt)
        {
            bool show = !binoculars && !Scoped;
            vmRoot.gameObject.SetActive(show);
            if (!show) return;
            var look = GameInput.Look;
            swayV = Vector2.Lerp(swayV, new Vector2(-look.x, -look.y) * 0.004f * (1 - aimK * 0.8f), dt * 8);
            var ads = new Vector3(0, 0, 0.18f) - W.sightOffset;
            var pos = Vector3.Lerp(hip, ads, aimK);
            float bob = Mathf.Sin(bobT) * 0.012f * Mathf.Clamp01(speedNow / 4) * (1 - aimK * 0.85f);
            pos += new Vector3(swayV.x + Mathf.Cos(bobT * 0.5f) * bob, swayV.y + bob, 0);
            var rot = Quaternion.identity;
            if (sprinting) { pos += new Vector3(-0.05f, -0.06f, -0.04f); rot = Quaternion.Euler(10, -35, 15); }
            if (reloadT > 0)
            {
                float k = Mathf.Sin(Mathf.Clamp01(1 - reloadT / W.reloadTime) * Mathf.PI);
                pos += new Vector3(0, -0.12f * k, 0);
                rot = Quaternion.Euler(25 * k, 0, -30 * k);
            }
            if (switchT > 0) pos += new Vector3(0, -0.3f * (switchT / 0.45f), 0);
            W.vm.localPosition = Vector3.Lerp(W.vm.localPosition, pos, dt * 18);
            W.vm.localRotation = Quaternion.Slerp(W.vm.localRotation, rot, dt * 12);
        }

        void Interaction(float dt)
        {
            var it = G.FindInteractable(transform.position);
            if (it == null) { prompt = null; interactProgress = 0; return; }
            prompt = it.label;
            if (it.time <= 0)
            {
                if (GameInput.KeyDown(KeyCode.E)) it.complete();
                return;
            }
            if (GameInput.Key(KeyCode.E))
            {
                interactProgress += dt / it.time;
                if (interactProgress >= 1) { interactProgress = 0; it.complete(); }
            }
            else interactProgress = Mathf.Max(0, interactProgress - dt);
        }
    }

    /// <summary>Thrown grenade: bounces, then explodes after the fuse burns.</summary>
    public class Grenade : MonoBehaviour
    {
        float fuse = 3.5f;

        void Update()
        {
            if (GameManager.I == null || !GameManager.I.Playing) return;
            fuse -= Time.deltaTime;
            if (fuse <= 0)
            {
                GameManager.I.Explode(transform.position, 8f, 220f, true);
                Destroy(gameObject);
            }
        }
    }
}
