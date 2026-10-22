using UnityEngine;

namespace WanniFront
{
    public interface ICombatant
    {
        Vector3 Position { get; }
        Vector3 AimPoint { get; }
        bool Alive { get; }
        Team Side { get; }
        /// How easy this combatant is to see and hit (stance, movement): 1 = standing still in the open.
        float Exposure { get; }
        void Damage(float amount, Vector3 from, bool head);
    }

    /// <summary>AI soldier (army ally or LTTE cadre) or civilian.</summary>
    public class Unit : MonoBehaviour, ICombatant
    {
        public enum State { Idle, Suspicious, Combat, Search, RunToAlarm, CivWait, CivFlee, CivSafe }

        static readonly string[] AllyNames = { "Cpl. Perera", "L/Cpl. Bandara", "Pte. Silva", "Pte. Rathnayake", "Pte. Kumara", "Sgt. Dissanayake" };
        static readonly Color[] Shirts = { new Color(0.85f, 0.83f, 0.78f), new Color(0.66f, 0.35f, 0.29f), new Color(0.36f, 0.48f, 0.63f), new Color(0.79f, 0.7f, 0.42f), new Color(0.48f, 0.54f, 0.35f) };
        static readonly Color[] Sarongs = { new Color(0.18f, 0.31f, 0.46f), new Color(0.42f, 0.18f, 0.23f), new Color(0.25f, 0.37f, 0.23f), new Color(0.35f, 0.29f, 0.48f) };

        public Team team;
        public string groupTag;
        public string displayName;
        public bool patrol, sentry;
        public float hp, maxHp;
        public State state;
        public float detection;     // 0..1, LTTE only
        public bool marked;          // spotted with binoculars
        public ICombatant target;
        public Unit killerUnit;
        public bool killedByPlayer;

        bool alive = true;
        CharacterController cc;
        Transform model, torso, head, armL, armR, legL, legR, muzzle;
        Quaternion bTorso, bHead, bArmL, bArmR, bLegL, bLegR;
        float yaw, pitch, speed, walkPhase, deadT, vy;
        float thinkT, fireT, strafe = 1, strafeT, lostT, searchT, suspiciousT, avoidT, avoidSign;
        int burst, index;
        Vector3 home, patrolPoint, lastKnown, safeSpot;
        bool hasLastKnown, hasSafeSpot;
        float patrolWait;
        bool visibleTarget;

        static GameManager G => GameManager.I;

        // ------------------------------------------------------------ ICombatant

        public Vector3 Position => transform.position;
        public Vector3 AimPoint => transform.position + Vector3.up * (state == State.CivWait ? 0.8f : 1.3f);
        public Vector3 Eye => transform.position + Vector3.up * 1.6f;
        public bool Alive => alive;
        public Team Side => team;
        public float Exposure => team == Team.Army ? 1.2f : 1f;
        public float HeadHeight => state == State.CivWait ? 0.95f : 1.45f;

        // ------------------------------------------------------------ creation

        public static Unit Create(Team team, Vector3 pos, float yaw, string tag, int index, bool patrol = false, bool sentry = false)
        {
            var go = new GameObject(team + " " + index);
            go.transform.position = pos + Vector3.up * 0.05f;
            var u = go.AddComponent<Unit>();
            u.team = team;
            u.groupTag = tag;
            u.index = index;
            u.patrol = patrol;
            u.sentry = sentry;
            u.yaw = yaw;
            u.home = pos;
            u.patrolPoint = pos;
            u.maxHp = u.hp = team == Team.Army ? 160 : 100;
            u.state = team == Team.Civilian ? State.CivWait : State.Idle;
            if (team == Team.Army) u.displayName = AllyNames[index % AllyNames.Length];
            u.Build();
            return u;
        }

        void Build()
        {
            gameObject.layer = Library.UnitLayer;
            cc = gameObject.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0, 0.9f, 0);
            cc.stepOffset = 0.45f;
            cc.slopeLimit = 55;
            string m = team == Team.Army ? "soldier_army" : team == Team.LTTE ? "soldier_ltte" : "civilian";
            model = Library.Spawn(m, transform.position, 0, 1, transform).transform;
            model.localPosition = Vector3.zero;
            model.localRotation = Quaternion.identity;
            Library.SetLayer(model.gameObject, Library.UnitLayer);
            torso = Library.Find(model, "Torso");
            head = Library.Find(model, "Head");
            armL = Library.Find(model, "ArmL");
            armR = Library.Find(model, "ArmR");
            legL = Library.Find(model, "LegL");
            legR = Library.Find(model, "LegR");
            muzzle = Library.Find(model, "Muzzle");
            if (torso) bTorso = torso.localRotation;
            if (head) bHead = head.localRotation;
            if (armL) bArmL = armL.localRotation;
            if (armR) bArmR = armR.localRotation;
            if (legL) bLegL = legL.localRotation;
            if (legR) bLegR = legR.localRotation;
            if (team == Team.Civilian)
            {
                Library.Tint(model.gameObject, "shirt", Shirts[Random.Range(0, Shirts.Length)]);
                Library.Tint(model.gameObject, "sarong", Sarongs[Random.Range(0, Sarongs.Length)]);
            }
            walkPhase = Random.value * 6;
            thinkT = Random.value * 0.3f;
            fireT = 1 + Random.value;
            transform.rotation = Quaternion.Euler(0, yaw, 0);
        }

        public Vector3 MuzzlePos => muzzle != null ? muzzle.position : transform.position + Vector3.up * 1.3f + transform.forward * 0.6f;

        // ------------------------------------------------------------ damage

        public void Damage(float amount, Vector3 from, bool headHit)
        {
            if (!alive) return;
            if (team == Team.Army) hp = Mathf.Max(25, hp - amount); // allies are wounded, never killed
            else hp -= amount;
            if (team == Team.LTTE && state != State.Combat && state != State.RunToAlarm)
            {
                lastKnown = from;
                hasLastKnown = true;
                EnterCombat(G.player);
            }
            if (hp <= 0) Die();
        }

        void Die()
        {
            alive = false;
            hp = 0;
            cc.enabled = false;
            G.OnUnitKilled(this);
        }

        // ------------------------------------------------------------ perception

        bool LineOfSight(Vector3 a, Vector3 b) => !Physics.Linecast(a, b, Library.WorldMask, QueryTriggerInteraction.Ignore);

        public void Hear(Vector3 pos, float radius, bool gunshot)
        {
            if (!alive || team != Team.LTTE) return;
            float d = Vector3.Distance(pos, transform.position);
            if (d > radius) return;
            if (G.IsLaterGroup(groupTag) && d > 25) return; // groups for later objectives stay put
            if (state == State.Combat || state == State.RunToAlarm) return;
            lastKnown = pos + Random.insideUnitSphere * (d * 0.1f);
            lastKnown.y = pos.y;
            hasLastKnown = true;
            if (gunshot)
            {
                detection = Mathf.Max(detection, 0.75f);
                if (d < radius * 0.5f) EnterCombat(G.player);
                else { state = State.Search; searchT = 14; }
            }
            else if (state == State.Idle)
            {
                detection = Mathf.Max(detection, 0.4f);
                state = State.Suspicious;
                suspiciousT = 0;
            }
        }

        public void EnterCombat(ICombatant who)
        {
            if (!alive || team != Team.LTTE) return;
            bool wasCalm = state != State.Combat && state != State.RunToAlarm;
            detection = 1;
            if (who != null && who.Alive)
            {
                target = who;
                if (!hasLastKnown) { lastKnown = who.Position; hasLastKnown = true; }
            }
            if (state != State.RunToAlarm) state = State.Combat;
            lostT = 0;
            if (!wasCalm) return;
            fireT = 0.5f + Random.value * 0.7f;
            G.OnEnemyAlerted(this);
            foreach (var u in G.units)
                if (u != this && u.alive && u.team == Team.LTTE && u.state != State.Combat && u.state != State.RunToAlarm
                    && Vector3.Distance(u.transform.position, transform.position) < 30)
                {
                    u.lastKnown = lastKnown;
                    u.hasLastKnown = true;
                    u.EnterCombat(who);
                }
        }

        public void SendToAlarm(Vector3 alarmPos)
        {
            state = State.RunToAlarm;
            lastKnown = alarmPos;
        }

        void Think()
        {
            visibleTarget = false;
            ICombatant best = null;
            float bestD = float.MaxValue;
            float range = sentry ? 95 : team == Team.Army ? 75 : 65;
            var p = G.player;
            if (team == Team.LTTE)
            {
                if (p.Alive) Consider(p, range, ref best, ref bestD);
                foreach (var u in G.units)
                    if (u.alive && u.team == Team.Army) Consider(u, range, ref best, ref bestD);
            }
            else
            {
                foreach (var u in G.units)
                    if (u.alive && u.team == Team.LTTE) Consider(u, range, ref best, ref bestD);
            }

            if (team == Team.Army)
            {
                // allies hold fire until the fight has started, so they never spoil the player's approach
                if (best is Unit e && (e.state == State.Combat || e.state == State.RunToAlarm || G.combatTimer > 0 || bestD < 15))
                {
                    target = best;
                    visibleTarget = true;
                    state = State.Combat;
                }
                else if (state == State.Combat && (target == null || !target.Alive)) state = State.Idle;
                return;
            }

            if (best != null)
            {
                if (state == State.Combat || state == State.RunToAlarm)
                {
                    target = best;
                    visibleTarget = true;
                    lastKnown = best.Position;
                    hasLastKnown = true;
                    lostT = 0;
                    return;
                }
                float rate = best.Exposure * Mathf.Clamp(28f / Mathf.Max(1, bestD), 0.35f, 4f) * G.difficulty;
                detection += rate * 0.2f * 0.9f;
                if (bestD < 3.5f) detection = 1;
                lastKnown = best.Position;
                hasLastKnown = true;
                if (detection >= 1) EnterCombat(best);
                else if (detection > 0.3f && state == State.Idle) { state = State.Suspicious; suspiciousT = 0; }
            }
            else if (state != State.Combat && state != State.RunToAlarm)
            {
                detection = Mathf.Max(0, detection - 0.06f);
            }
        }

        void Consider(ICombatant h, float range, ref ICombatant best, ref float bestD)
        {
            float d = Vector3.Distance(h.Position, transform.position);
            if (d > range * Mathf.Lerp(0.55f, 1f, Mathf.Clamp01(h.Exposure)) || d >= bestD) return;
            var to = h.Position - transform.position;
            to.y = 0;
            bool alert = state == State.Combat || state == State.Search || state == State.RunToAlarm;
            if (!alert && team == Team.LTTE && d > 4 && Vector3.Angle(transform.forward, to) > 65) return;
            if (!LineOfSight(Eye, h.AimPoint)) return;
            best = h;
            bestD = d;
        }

        // ------------------------------------------------------------ update

        void Update()
        {
            if (G == null || !G.Playing) return;
            float dt = Time.deltaTime;
            if (!alive) { Animate(dt); return; }
            thinkT -= dt;
            if (thinkT <= 0 && team != Team.Civilian) { Think(); thinkT = 0.2f; }

            Vector3 move = Vector3.zero;
            float spd = 0;
            switch (team)
            {
                case Team.Civilian: CivilianLogic(dt, ref move, ref spd); break;
                case Team.Army: AllyLogic(dt, ref move, ref spd); break;
                default: EnemyLogic(dt, ref move, ref spd); break;
            }
            if (sentry) spd = 0;
            Move(move, spd, dt);
            transform.rotation = Quaternion.Euler(0, yaw, 0);
            Animate(dt);
        }

        void EnemyLogic(float dt, ref Vector3 move, ref float spd)
        {
            switch (state)
            {
                case State.Idle:
                    pitch *= 0.9f;
                    if (patrol)
                    {
                        if (Flat(patrolPoint - transform.position).magnitude < 1.2f)
                        {
                            patrolWait -= dt;
                            yaw += Mathf.Sin(Time.time * 0.5f + index) * dt * 30;
                            if (patrolWait <= 0)
                            {
                                var r = Random.insideUnitCircle * 14;
                                patrolPoint = home + new Vector3(r.x, 0, r.y);
                                if (G.world.IsWater(patrolPoint.x, patrolPoint.z, 0)) patrolPoint = home;
                                patrolWait = 2 + Random.value * 4;
                            }
                        }
                        else { Face(patrolPoint, dt, 3); move = patrolPoint - transform.position; spd = 1.4f; }
                    }
                    else yaw += Mathf.Sin(Time.time * 0.3f + index) * dt * 12;
                    break;

                case State.Suspicious:
                    suspiciousT += dt;
                    if (hasLastKnown) Face(lastKnown, dt, 3);
                    if (suspiciousT > 1.5f && hasLastKnown && !sentry && Flat(lastKnown - transform.position).magnitude > 2)
                    {
                        move = lastKnown - transform.position;
                        spd = 1.8f;
                    }
                    if (detection <= 0.05f) state = State.Idle;
                    break;

                case State.Search:
                    searchT -= dt;
                    if (hasLastKnown && Flat(lastKnown - transform.position).magnitude > 3 && !sentry)
                    {
                        Face(lastKnown, dt, 4);
                        move = lastKnown - transform.position;
                        spd = 3.2f;
                    }
                    else yaw += dt * 50;
                    if (searchT <= 0) { state = State.Idle; detection = 0.5f; home = transform.position; patrolPoint = home; }
                    break;

                case State.RunToAlarm:
                    var alarm = G.AlarmFor(this);
                    if (alarm == null || alarm.disabled || alarm.triggered) { state = State.Combat; break; }
                    Face(alarm.pos, dt, 8);
                    move = alarm.pos - transform.position;
                    spd = 5.2f;
                    if (Flat(alarm.pos - transform.position).magnitude < 1.8f) G.TriggerAlarm(alarm);
                    break;

                case State.Combat:
                    if (target == null || !target.Alive) { target = G.player.Alive ? (ICombatant)G.player : null; visibleTarget = false; }
                    if (visibleTarget && target != null)
                    {
                        float dist = Vector3.Distance(target.Position, transform.position);
                        Face(target.Position, dt, 8);
                        pitch = Mathf.Atan2(target.AimPoint.y - Eye.y, dist) * Mathf.Rad2Deg;
                        strafeT -= dt;
                        if (strafeT <= 0) { strafe = -strafe; strafeT = 1.5f + Random.value * 2.5f; }
                        float adv = dist > 30 ? 1 : dist < 10 ? -1 : 0;
                        move = transform.forward * adv + transform.right * strafe * 0.6f;
                        spd = burst > 0 ? 0 : 2.2f;
                        FireAt(target, dist, dt);
                    }
                    else
                    {
                        lostT += dt;
                        if (hasLastKnown && Flat(lastKnown - transform.position).magnitude > 4)
                        {
                            Face(lastKnown, dt, 5);
                            move = lastKnown - transform.position;
                            spd = 3.6f;
                        }
                        if (lostT > 12) { state = State.Search; searchT = 12; }
                    }
                    break;
            }
        }

        void AllyLogic(float dt, ref Vector3 move, ref float spd)
        {
            if (state == State.Combat && visibleTarget && target != null && target.Alive)
            {
                float dist = Vector3.Distance(target.Position, transform.position);
                Face(target.Position, dt, 8);
                pitch = Mathf.Atan2(target.AimPoint.y - Eye.y, dist) * Mathf.Rad2Deg;
                FireAt(target, dist, dt);
                if (dist > 35) { move = transform.forward; spd = 2.5f; }
                return;
            }
            pitch *= 0.9f;
            if (groupTag == "linkup") return;
            var p = G.player;
            if (!p.Alive) return;
            int side = index % 2 == 1 ? 1 : -1;
            float back = 4 + (index / 2) * 3;
            var fwd = p.Forward;
            var right = Vector3.Cross(Vector3.up, fwd);
            var f = p.Position - fwd * back + right * side * 3;
            float d = Flat(f - transform.position).magnitude;
            if (d > 2.5f)
            {
                Face(f, dt, 5);
                move = f - transform.position;
                spd = d > 12 ? 6 : d > 5 ? 4 : 2.5f;
                if (p.CurrentStance != Player.Stance.Stand) spd = Mathf.Min(spd, 2.5f);
            }
        }

        void CivilianLogic(float dt, ref Vector3 move, ref float spd)
        {
            var obj = G.CurrentObjective;
            var p = G.player;
            if (state == State.CivWait)
            {
                if (obj != null && obj.type == ObjType.Escort && p.Alive && Vector3.Distance(p.Position, transform.position) < 12)
                {
                    state = State.CivFlee;
                    G.Toast("Civilians: \"Thank you — we are coming!\"");
                }
            }
            else if (state == State.CivFlee)
            {
                var z = G.EscortZone;
                var zone = new Vector3(z.x, 0, z.y);
                var tgt = zone;
                float toZone = Flat(zone - transform.position).magnitude;
                if (p.Alive && Vector3.Distance(p.Position, transform.position) > 9 && toZone > 30) tgt = p.Position;
                Face(tgt, dt, 5);
                move = tgt - transform.position;
                spd = 3.6f;
                if (toZone < z.z)
                {
                    state = State.CivSafe;
                    var r = Random.insideUnitCircle * z.z * 0.5f;
                    safeSpot = zone + new Vector3(r.x, 0, r.y);
                    hasSafeSpot = true;
                    G.OnCivilianSafe(this);
                }
            }
            else if (hasSafeSpot && Flat(safeSpot - transform.position).magnitude > 1)
            {
                Face(safeSpot, dt, 5);
                move = safeSpot - transform.position;
                spd = 2;
            }
        }

        // ------------------------------------------------------------ helpers

        static Vector3 Flat(Vector3 v) { v.y = 0; return v; }

        void Face(Vector3 p, float dt, float rate)
        {
            var d = p - transform.position;
            float want = Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg;
            yaw = Mathf.LerpAngle(yaw, want, Mathf.Min(1, rate * dt));
        }

        void Move(Vector3 dir, float spd, float dt)
        {
            dir.y = 0;
            var start = transform.position;
            Vector3 horiz = Vector3.zero;
            if (dir.sqrMagnitude > 1e-4f && spd > 0)
            {
                dir.Normalize();
                if (avoidT > 0)
                {
                    avoidT -= dt;
                    dir = Quaternion.Euler(0, avoidSign * 70, 0) * dir;
                }
                horiz = dir * spd;
                var next = transform.position + horiz * dt;
                if (G.world.IsWater(next.x, next.z)) horiz = Vector3.zero;
            }
            vy = cc.isGrounded ? -1f : vy - 20 * dt;
            cc.Move((horiz + Vector3.up * vy) * dt);
            var moved = Flat(transform.position - start).magnitude;
            speed = dt > 0 ? moved / dt : 0;
            if (horiz.sqrMagnitude > 0.01f && avoidT <= 0 && moved < spd * dt * 0.35f)
            {
                avoidT = 0.6f + Random.value * 0.8f;
                avoidSign = Random.value < 0.5f ? 1 : -1;
            }
        }

        void Rot(Transform t, Quaternion b, float deg)
        {
            if (t == null) return;
            var axis = t.parent.InverseTransformDirection(transform.right);
            t.localRotation = Quaternion.AngleAxis(deg, axis) * b;
        }

        void Animate(float dt)
        {
            if (!alive)
            {
                deadT += dt;
                float k = Mathf.Clamp01(deadT * 2.5f);
                model.localRotation = Quaternion.AngleAxis(-86 * k, Vector3.right);
                model.localPosition = new Vector3(0, 0.12f * k - Mathf.Max(0, deadT - 45) * 0.05f, 0);
                if (deadT > 60) gameObject.SetActive(false);
                return;
            }
            bool moving = speed > 0.2f;
            if (moving) walkPhase += dt * speed * 2.1f;
            float swing = moving ? Mathf.Sin(walkPhase) * Mathf.Min(40, 10 * speed) : 0;
            Rot(legL, bLegL, swing);
            Rot(legR, bLegR, -swing);
            model.localPosition = new Vector3(0, moving ? Mathf.Abs(Mathf.Cos(walkPhase)) * 0.04f : 0, 0);
            if (team == Team.Civilian)
            {
                Rot(armL, bArmL, -swing * 0.8f);
                Rot(armR, bArmR, swing * 0.8f);
                if (state == State.CivWait)
                {
                    Rot(torso, bTorso, 20);
                    Rot(legL, bLegL, -50);
                    Rot(legR, bLegR, -50);
                    model.localPosition = new Vector3(0, -0.32f, 0);
                }
                else Rot(torso, bTorso, moving ? 7 : 0);
            }
            else
            {
                Rot(torso, bTorso, -pitch * 0.85f);
                Rot(head, bHead, -pitch * 0.2f);
            }
        }

        void FireAt(ICombatant tgt, float dist, float dt)
        {
            fireT -= dt;
            if (fireT > 0) return;
            if (burst <= 0) burst = 2 + Random.Range(0, 4);
            burst--;
            fireT = burst > 0 ? 0.11f : 0.9f + Random.value * 1.2f;

            var from = MuzzlePos;
            float chance;
            if (team == Team.Army) chance = Mathf.Clamp(0.45f - dist / 120f, 0.1f, 0.4f);
            else
            {
                chance = Mathf.Clamp((sentry ? 0.5f : 0.42f) - dist / 140f, 0.05f, 0.4f) * Mathf.Clamp(tgt.Exposure, 0.3f, 1.3f);
                if (tgt is Player) chance *= G.difficulty;
            }
            bool hit = Random.value < chance;
            var aim = tgt.AimPoint;
            if (!hit) aim += new Vector3(Random.Range(-1.5f, 1.5f), Random.Range(-0.5f, 1f), Random.Range(-1.5f, 1.5f));
            var dir = (aim - from).normalized;
            Vector3 end = from + dir * 200;
            if (Physics.Raycast(from, dir, out var rh, 200, Library.WorldMask, QueryTriggerInteraction.Ignore)
                && (!hit || rh.distance < Vector3.Distance(from, aim) - 0.5f))
            {
                end = rh.point;
                hit = false;
                Fx.I.Impact(rh.point, rh.normal, false);
            }
            else if (hit) end = aim;
            Fx.I.Tracer(from, end, team == Team.LTTE ? new Color(1f, 0.7f, 0.4f) : new Color(1f, 0.95f, 0.6f));
            Fx.I.MuzzleFlash(from);
            Sfx.I.Gunshot(from, false, sentry, G.player.Position);
            if (hit)
            {
                float dmg = team == Team.Army ? 26 : Random.Range(7f, 13f);
                tgt.Damage(dmg, from, false);
            }
            else if (tgt is Player && dist < 60) G.player.NearMiss();
            G.combatTimer = 10;
        }
    }
}
