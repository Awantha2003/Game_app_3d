"""
Wanni Front - Blender asset builder.

Builds every 3D model used by the game procedurally, saves an editable
.blend file for each one (blender/models/*.blend) and exports a .glb for
the game (public/models/*.glb).

It also exports an .fbx of every model, its textures and a materials.json
into the Unity project (unity/WanniFront/Assets/WanniFront/Resources).

Run with Blender:
    blender -b -P blender/build_assets.py
or with the `bpy` Python module (pip install bpy):
    python blender/build_assets.py

Conventions
- Blender units are metres, Z is up, models face -Y (glTF exports this as +Z forward).
- Soldiers are built from named parts (Torso, Head, ArmL, ArmR, LegL, LegR, Muzzle)
  whose origins sit on the joints, so the game can animate them without a rig.
"""

import math
import os
import random

import bpy  # noqa: E402  (must be imported before bmesh when used as a module)
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLB_DIR = os.path.join(ROOT, "public", "models")
BLEND_DIR = os.path.join(ROOT, "blender", "models")
UNITY_RES = os.path.join(ROOT, "unity", "WanniFront", "Assets", "WanniFront", "Resources")
UNITY_MODELS = os.path.join(UNITY_RES, "Models")
UNITY_TEX = os.path.join(UNITY_RES, "Textures")
UNITY_MATERIALS = {}
TEX = 256


# --------------------------------------------------------------------------
# Scene / material helpers
# --------------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    MATINFO.clear()


def srgb_to_linear(c):
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]


def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


MATS = {}
MATINFO = {}


def mat(name, color="#808080", rough=0.85, metal=0.0, image=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb_to_linear(hex_rgb(color)) + [1.0]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if image is not None:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    MATS[name] = m
    MATINFO[name] = {"color": color, "roughness": rough, "metallic": metal,
                     "texture": image.name if image is not None else None}
    return m


# --------------------------------------------------------------------------
# Procedural textures (tileable value noise -> camouflage patterns)
# --------------------------------------------------------------------------

def value_noise(w, h, gx, gy, rng):
    g = rng.random((gy, gx))
    ys = np.arange(h) * gy / h
    xs = np.arange(w) * gx / w
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y1 = (y0 + 1) % gy
    x1 = (x0 + 1) % gx
    a = g[y0][:, x0]
    b = g[y0][:, x1]
    c = g[y1][:, x0]
    d = g[y1][:, x1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def fbm(w, h, gx, gy, seed, octaves=4):
    rng = np.random.default_rng(seed)
    total = np.zeros((h, w))
    amp, norm = 1.0, 0.0
    for i in range(octaves):
        total += value_noise(w, h, gx * 2 ** i, gy * 2 ** i, rng) * amp
        norm += amp
        amp *= 0.5
    return total / norm


def make_image(name, rgb):
    """rgb: (h, w, 3) array of sRGB floats."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = "PNG"
    img.pack()
    return img


def camo(name, base, layers, seed, gx=4, gy=4):
    """layers: list of (hex colour, threshold). Higher threshold = smaller blobs."""
    out = np.zeros((TEX, TEX, 3))
    out[:] = hex_rgb(base)
    for i, (col, thr) in enumerate(layers):
        n = fbm(TEX, TEX, gx, gy, seed + i * 17)
        out[n > thr] = hex_rgb(col)
    grain = fbm(TEX, TEX, 32, 32, seed + 99, 2)[..., None]
    out *= 0.92 + grain * 0.16
    return make_image(name, np.clip(out, 0, 1))


def tex_army_dpm():
    # Sri Lanka Army woodland DPM: khaki base, green, brown and dark blotches
    return camo("tex_army_dpm", "#8c8358",
                [("#4d5a2c", 0.52), ("#5e4127", 0.58), ("#262a1a", 0.66)], 11)


def tex_tiger_stripe():
    # LTTE "tiger stripe": horizontally stretched stripes of brown/black on olive
    return camo("tex_tiger_stripe", "#6d6a3a",
                [("#5a3d1e", 0.5), ("#16140d", 0.6)], 23, gx=2, gy=12)


def tex_vehicle():
    return camo("tex_vehicle_camo", "#4f5b30",
                [("#6b5131", 0.55), ("#2a2c1c", 0.63)], 41, gx=3, gy=3)


def tex_noise(name, c1, c2, seed, gx=8, gy=8, stripes=None):
    n = fbm(TEX, TEX, gx, gy, seed)[..., None]
    a, b = np.array(hex_rgb(c1)), np.array(hex_rgb(c2))
    out = a * (1 - n) + b * n
    if stripes:
        rows = (np.arange(TEX) // (TEX // stripes)) % 2
        out *= (0.85 + 0.15 * rows)[:, None, None]
        edge = (np.arange(TEX) % (TEX // stripes)) < 3
        out[edge] *= 0.6
    return make_image(name, np.clip(out, 0, 1))


# --------------------------------------------------------------------------
# Mesh building: a Part collects primitives (each with its own material)
# into one mesh object whose origin is the part's pivot.
# --------------------------------------------------------------------------

def xform(at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    r = Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
    return Matrix.Translation(Vector(at)) @ r @ Matrix.Diagonal((*scale, 1.0))


class Part:
    def __init__(self, name, uv_scale=1.6):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.uv_scale = uv_scale

    def _tag(self, before, m, smooth=False):
        if m not in self.mats:
            self.mats.append(m)
        idx = self.mats.index(m)
        for f in self.bm.faces:
            if f not in before:
                f.material_index = idx
                f.smooth = smooth
        return self

    def box(self, m, size, at=(0, 0, 0), rot=(0, 0, 0)):
        before = set(self.bm.faces)
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=xform(at, rot, size))
        return self._tag(before, m)

    def cyl(self, m, r, depth, at=(0, 0, 0), rot=(0, 0, 0), seg=10, r2=None, smooth=True):
        before = set(self.bm.faces)
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r, radius2=r if r2 is None else r2, depth=depth,
                              matrix=xform(at, rot))
        return self._tag(before, m, smooth)

    def sphere(self, m, r, at=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), seg=10, smooth=True):
        before = set(self.bm.faces)
        bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(4, seg // 2 + 1),
                                  radius=r, matrix=xform(at, rot, scale))
        return self._tag(before, m, smooth)

    def ico(self, m, r, at=(0, 0, 0), scale=(1, 1, 1), sub=1, jitter=0.0, seed=0):
        before = set(self.bm.faces)
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r,
                                         matrix=xform(at, (0, 0, 0), scale))
        if jitter:
            rnd = random.Random(seed)
            for v in res["verts"]:
                v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * jitter
        return self._tag(before, m)

    def prism(self, m, length, bottom_w, top_w, h, at=(0, 0, 0), rot=(0, 0, 0)):
        """Trapezoid cross-section along Y (earth bunds, sandbag walls, hulls)."""
        before = set(self.bm.faces)
        M = xform(at, rot)
        L = length / 2
        pts = [(-bottom_w / 2, 0), (bottom_w / 2, 0), (top_w / 2, h), (-top_w / 2, h)]
        front = [self.bm.verts.new(M @ Vector((x, -L, z))) for x, z in pts]
        back = [self.bm.verts.new(M @ Vector((x, L, z))) for x, z in pts]
        self.bm.faces.new(front[::-1])
        self.bm.faces.new(back)
        for i in range(4):
            j = (i + 1) % 4
            self.bm.faces.new([front[i], front[j], back[j], back[i]])
        return self._tag(before, m)

    def finish(self, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
        bm = self.bm
        bm.normal_update()
        uv = bm.loops.layers.uv.new("UVMap")
        s = self.uv_scale
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            for loop in f.loops:
                co = loop.vert.co
                loop[uv].uv = (co[a] * s, co[b] * s)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.location = loc
        ob.rotation_euler = Euler([math.radians(a) for a in rot])
        return ob


def empty(name, parent=None, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


def save(name):
    os.makedirs(GLB_DIR, exist_ok=True)
    os.makedirs(BLEND_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, name + ".blend"), compress=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(GLB_DIR, name + ".glb"),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    export_unity(name)
    print("built", name)


def export_unity(name):
    """FBX + PNG textures + material table for the Unity project."""
    os.makedirs(UNITY_MODELS, exist_ok=True)
    os.makedirs(UNITY_TEX, exist_ok=True)
    for img in bpy.data.images:
        if img.type != "IMAGE" or img.size[0] == 0:
            continue
        path = os.path.join(UNITY_TEX, img.name + ".png")
        if not os.path.exists(path):
            img.filepath_raw = path
            img.file_format = "PNG"
            img.save()
    bpy.ops.export_scene.fbx(
        filepath=os.path.join(UNITY_MODELS, name + ".fbx"),
        use_selection=False,
        object_types={"EMPTY", "MESH"},
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="STRIP",
    )
    UNITY_MATERIALS[name] = dict(MATINFO)


# --------------------------------------------------------------------------
# Characters
# --------------------------------------------------------------------------

def rifle(parent, at):
    """Type 56 assault rifle (AK pattern), used by both sides."""
    metal = mat("gun_metal", "#25272a", 0.45, 0.8)
    wood = mat("gun_wood", "#6b3d1f", 0.6)
    p = Part("Rifle")
    p.box(metal, (0.05, 0.30, 0.075), (0, 0, 0))
    p.cyl(metal, 0.012, 0.36, (0, -0.33, 0.015), (90, 0, 0), seg=6)
    p.cyl(metal, 0.01, 0.2, (0, -0.24, 0.045), (90, 0, 0), seg=6)
    p.box(metal, (0.012, 0.02, 0.05), (0, -0.48, 0.04))
    p.box(wood, (0.056, 0.17, 0.065), (0, -0.22, 0.0))
    p.box(wood, (0.045, 0.26, 0.07), (0, 0.27, -0.025), (-8, 0, 0))
    p.box(wood, (0.04, 0.05, 0.1), (0, 0.1, -0.08), (-20, 0, 0))
    p.box(metal, (0.038, 0.065, 0.17), (0, -0.07, -0.1), (18, 0, 0))
    ob = p.finish(parent, at)
    empty("Muzzle", ob, (0, -0.52, 0.015))
    return ob


def tex_face_paint(skin):
    """Skin with green and black camouflage cream stripes."""
    out = np.zeros((TEX, TEX, 3))
    out[:] = hex_rgb(skin)
    n1 = fbm(TEX, TEX, 2, 6, 61)
    n2 = fbm(TEX, TEX, 3, 8, 67)
    out[n1 > 0.55] = hex_rgb("#2f4a22")
    out[n2 > 0.62] = hex_rgb("#141510")
    return make_image("tex_face_paint", out)


def ghillie_strips(p, mats, centers, count, length, seed):
    """Hang loose burlap strips around the given points (ghillie suit)."""
    rnd = random.Random(seed)
    for i in range(count):
        cx, cy, cz, r = centers[i % len(centers)]
        a = rnd.uniform(0, math.tau)
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        z = cz + rnd.uniform(-0.05, 0.05)
        ln = rnd.uniform(length * 0.6, length)
        p.box(mats[i % len(mats)], (rnd.uniform(0.02, 0.05), 0.012, ln), (x, y, z - ln / 2),
              (rnd.uniform(-25, 25), rnd.uniform(-25, 25), math.degrees(a) + 90))


def soldier(name, cloth_tex, skin, faction, hat=None, paint=False, ghillie=False, weapon="t56"):
    reset()
    cloth = mat("uniform", "#ffffff", 0.95, image=cloth_tex())
    skin_m = mat("skin", skin, 0.7)
    face_m = mat("face_paint", "#ffffff", 0.75, image=tex_face_paint(skin)) if paint else skin_m
    burlap = [mat("ghillie_tan", "#8c7a52", 1.0), mat("ghillie_green", "#4f5a2c", 1.0), mat("ghillie_brown", "#5a4630", 1.0)]
    boot = mat("boot", "#1b1712", 0.6)
    gear = mat("webbing", "#3d4128" if faction == "army" else "#2b2a1f", 0.9)
    hair = mat("hair", "#0f0d0b", 0.9)

    root = empty("Soldier")

    pelvis = Part("Pelvis")
    pelvis.box(cloth, (0.36, 0.2, 0.2), (0, 0, 0.98))
    pelvis.box(gear, (0.38, 0.22, 0.05), (0, 0, 1.05))
    pelvis.finish(root)

    for side, x in (("L", 0.105), ("R", -0.105)):
        leg = Part("Leg" + side)
        leg.box(cloth, (0.15, 0.17, 0.5), (0, 0, -0.25))
        leg.box(cloth, (0.13, 0.15, 0.4), (0, 0, -0.66))
        leg.box(boot, (0.13, 0.27, 0.11), (0, -0.04, -0.895))
        leg.box(boot, (0.135, 0.16, 0.12), (0, 0, -0.8))
        leg.finish(root, (x, 0, 0.95))

    torso = Part("Torso")
    torso.box(cloth, (0.42, 0.24, 0.52), (0, 0, 0.27))
    torso.box(gear, (0.44, 0.27, 0.26), (0, 0, 0.2))
    for x in (-0.12, 0, 0.12):
        torso.box(gear, (0.09, 0.06, 0.12), (x, -0.155, 0.17))
    torso.box(gear, (0.34, 0.17, 0.38) if faction == "army" else (0.26, 0.12, 0.3),
              (0, 0.2, 0.3))
    if faction == "ltte":
        # cyanide capsule cord and chest rig straps
        torso.box(gear, (0.05, 0.25, 0.5), (0.12, 0, 0.3), (0, 0, -20))
        torso.box(gear, (0.05, 0.25, 0.5), (-0.12, 0, 0.3), (0, 0, 20))
    torso.cyl(skin_m, 0.055, 0.1, (0, 0, 0.56), seg=8)
    if ghillie:
        ghillie_strips(torso, burlap, [(0, 0.05, 0.52, 0.2), (0.18, 0.08, 0.45, 0.08), (-0.18, 0.08, 0.45, 0.08),
                                       (0, 0.18, 0.4, 0.15)], 70, 0.45, 5)
    else:
        # bandolier across the chest
        torso.box(gear, (0.06, 0.3, 0.62), (0, -0.02, 0.3), (0, 0, 0), )
    t = torso.finish(root, (0, 0, 1.0))

    head = Part("Head")
    head.sphere(face_m, 0.115, (0, 0, 0.11), (0.9, 1.0, 1.08))
    head.box(face_m, (0.04, 0.05, 0.04), (0, -0.115, 0.1))
    if hat == "boonie":
        head.cyl(cloth, 0.2, 0.02, (0, 0, 0.17), seg=16)
        head.cyl(cloth, 0.125, 0.11, (0, 0, 0.23), seg=12, r2=0.11)
        head.cyl(gear, 0.127, 0.025, (0, 0, 0.19), seg=12)
        if ghillie:
            ghillie_strips(head, burlap, [(0, 0, 0.26, 0.12), (0, 0.04, 0.2, 0.19)], 46, 0.32, 9)
    elif faction == "army":
        helmet = mat("helmet", "#3f4a26", 0.8)
        head.sphere(helmet, 0.145, (0, 0, 0.15), (1.0, 1.05, 0.75), seg=12)
        head.cyl(helmet, 0.16, 0.02, (0, 0, 0.1), seg=12)
        head.box(gear, (0.2, 0.015, 0.02), (0, -0.115, 0.04))
    else:
        cap = mat("cap", "#4b4a2a", 0.95)
        head.sphere(hair, 0.12, (0, 0.012, 0.135), (0.95, 1.0, 0.9))
        head.cyl(cap, 0.12, 0.08, (0, 0, 0.2), seg=12)
        head.box(cap, (0.17, 0.11, 0.015), (0, -0.13, 0.17), (8, 0, 0))
    head.finish(t, (0, 0, 0.6))

    # Arms hold the rifle: right hand on the grip, left hand on the handguard
    arm_r = Part("ArmR")
    arm_r.box(cloth, (0.11, 0.12, 0.3), (0, 0, -0.14))
    arm_r.box(cloth, (0.1, 0.3, 0.1), (0, -0.13, -0.3))
    arm_r.sphere(skin_m, 0.05, (0, -0.29, -0.3), seg=8)
    arm_r.finish(t, (-0.26, 0, 0.46), (0, 0, -8))

    arm_l = Part("ArmL")
    arm_l.box(cloth, (0.11, 0.12, 0.3), (0, 0, -0.14))
    arm_l.box(cloth, (0.1, 0.42, 0.1), (0, -0.19, -0.29))
    arm_l.sphere(skin_m, 0.05, (0, -0.42, -0.28), seg=8)
    arm_l.finish(t, (0.25, 0, 0.46), (0, 0, -32))

    if weapon == "svd":
        p = Part("Rifle", 4.0)
        muzzle, _, _ = build_svd(p)
        ob = p.finish(t, (-0.1, -0.2, 0.18))
        empty("Muzzle", ob, muzzle)
    else:
        rifle(t, (-0.1, -0.24, 0.2))
    save(name)


def civilian():
    reset()
    shirt = mat("shirt", "#d9d4c7", 0.95)
    sarong = mat("sarong", "#3b5a7a", 0.95, image=tex_noise("tex_sarong", "#2f4f75", "#46698f", 5, 2, 16, stripes=8))
    skin_m = mat("skin", "#7a5236", 0.7)
    hair = mat("hair", "#0f0d0b", 0.9)
    root = empty("Civilian")
    for side, x in (("L", 0.1), ("R", -0.1)):
        leg = Part("Leg" + side)
        leg.box(sarong, (0.17, 0.2, 0.86), (0, 0, -0.43))
        leg.box(skin_m, (0.1, 0.22, 0.07), (0, -0.04, -0.91))
        leg.finish(root, (x, 0, 0.95))
    torso = Part("Torso")
    torso.box(sarong, (0.38, 0.22, 0.14), (0, 0, 0.0))
    torso.box(shirt, (0.4, 0.22, 0.52), (0, 0, 0.3))
    torso.cyl(skin_m, 0.05, 0.1, (0, 0, 0.58), seg=8)
    t = torso.finish(root, (0, 0, 0.98))
    head = Part("Head")
    head.sphere(skin_m, 0.11, (0, 0, 0.11), (0.9, 1.0, 1.08))
    head.sphere(hair, 0.115, (0, 0.015, 0.15), (0.95, 1.0, 0.8))
    head.finish(t, (0, 0, 0.6))
    for side, x in (("L", 0.25), ("R", -0.25)):
        arm = Part("Arm" + side)
        arm.box(shirt, (0.11, 0.12, 0.3), (0, 0, -0.14))
        arm.box(skin_m, (0.08, 0.08, 0.28), (0, 0, -0.42))
        arm.sphere(skin_m, 0.045, (0, 0, -0.58), seg=8)
        arm.finish(t, (x, 0, 0.47))
    save("civilian")


# --------------------------------------------------------------------------
# Vehicles
# --------------------------------------------------------------------------

def buffel():
    """Sri Lanka Army Unibuffel-style mine-protected APC."""
    reset()
    camo_m = mat("vehicle_camo", "#ffffff", 0.8, image=tex_vehicle())
    tyre = mat("tyre", "#151515", 0.9)
    steel = mat("steel", "#2c2f2a", 0.5, 0.6)
    glass = mat("glass", "#1e2b30", 0.2, 0.3)
    root = empty("Buffel")
    p = Part("Body", 0.5)
    p.box(steel, (1.2, 4.6, 0.25), (0, 0, 0.7))
    p.prism(camo_m, 3.2, 0.6, 2.3, 1.1, (0, 0.5, 0.75))
    p.box(camo_m, (2.3, 3.2, 0.9), (0, 0.5, 2.3))
    p.box(steel, (2.36, 3.26, 0.08), (0, 0.5, 2.78))
    for x in (-1.13, 1.13):
        for y in (-0.4, 0.5, 1.4):
            p.box(glass, (0.05, 0.4, 0.3), (x, y, 2.4))
    p.box(camo_m, (0.95, 1.1, 1.0), (-0.62, -1.7, 1.75))
    p.box(glass, (0.8, 0.05, 0.35), (-0.62, -2.26, 1.95))
    p.box(camo_m, (1.2, 1.4, 0.7), (0.3, -1.65, 1.2))
    p.box(steel, (2.0, 0.15, 0.25), (0, -2.35, 0.85))
    p.cyl(steel, 0.04, 1.1, (0, 0.2, 3.25), (90, 0, 0), seg=6)
    p.box(steel, (0.3, 0.4, 0.35), (0, 0.6, 3.0))
    p.box(steel, (0.9, 0.06, 0.45), (0, 0.4, 3.0))
    p.finish(root)
    for x in (-1.0, 1.0):
        for y in (-1.5, 1.5):
            w = Part("Wheel", 1.0)
            w.cyl(tyre, 0.55, 0.4, rot=(0, 90, 0), seg=14)
            w.cyl(steel, 0.28, 0.42, rot=(0, 90, 0), seg=8)
            w.finish(root, (x, y, 0.55))
    save("buffel")


def sea_tiger_boat():
    """Fibreglass fast attack craft of the type used by the Sea Tigers."""
    reset()
    hull = mat("fibreglass", "#3c4146", 0.5)
    deck = mat("deck", "#2a2d30", 0.7)
    eng = mat("engine", "#141414", 0.4, 0.5)
    p = Part("Boat", 0.4)
    p.prism(hull, 6.0, 0.6, 2.4, 0.9, (0, 0.6, 0))
    p.prism(hull, 2.2, 0.2, 2.4, 0.9, (0, -3.0, 0.1), (8, 0, 0))
    p.box(deck, (2.2, 6.0, 0.08), (0, 0.6, 0.92))
    p.box(deck, (1.0, 1.0, 0.7), (0, -0.4, 1.3))
    p.cyl(eng, 0.035, 1.0, (0, -1.6, 1.55), (90, 0, 0), seg=6)
    p.box(eng, (0.25, 0.4, 0.25), (0, -1.0, 1.45))
    for x in (-0.6, 0.0, 0.6):
        p.box(eng, (0.35, 0.45, 0.6), (x, 3.75, 1.0))
        p.box(eng, (0.12, 0.15, 0.7), (x, 3.85, 0.35))
    p.finish()
    save("seatiger_boat")


# --------------------------------------------------------------------------
# Structures and props
# --------------------------------------------------------------------------

def bunker():
    reset()
    bag = mat("sandbag", "#ffffff", 1.0, image=tex_noise("tex_sandbag", "#8e7e5a", "#b2a27a", 3, 12, 12))
    log = mat("log", "#4a3520", 0.9)
    dark = mat("dark", "#111111", 1.0)
    p = Part("Bunker", 1.2)
    rnd = random.Random(4)
    for ring in range(4):
        z = 0.15 + ring * 0.28
        n = 14
        for i in range(n):
            a = (i + (ring % 2) * 0.5) / n * math.tau
            if ring in (2, 3) and -0.5 < math.sin(a) < 0.5 and math.cos(a) < 0:
                continue
            if ring == 1 and math.sin(a) < -0.85:
                continue
            p.box(bag, (0.56, 0.34, 0.22), (math.cos(a) * 1.5, math.sin(a) * 1.5, z),
                  (0, rnd.uniform(-4, 4), math.degrees(a) + 90))
    for i in range(7):
        p.cyl(log, 0.11, 3.6, (-1.5 + i * 0.5, 0, 1.3), (90, 0, 0), seg=6)
    p.box(bag, (3.2, 3.2, 0.2), (0, 0, 1.5))
    p.box(dark, (2.4, 2.4, 0.05), (0, 0, 0.03))
    p.finish()
    save("bunker")


def earth_bund():
    """20 m segment of the LTTE ditch-cum-earth-bund defence line."""
    reset()
    earth = mat("earth", "#ffffff", 1.0, image=tex_noise("tex_earth", "#6e4a2c", "#93693f", 8, 6, 6))
    grass = mat("bund_grass", "#5b6b2e", 1.0)
    bag = mat("sandbag2", "#9a8a64", 1.0)
    p = Part("Bund", 0.3)
    p.prism(earth, 20.0, 6.0, 1.6, 3.0, (0, 0, -0.2), (0, 0, 90))
    p.prism(grass, 19.0, 1.6, 1.2, 0.15, (0, 0, 2.8), (0, 0, 90))
    for i in range(10):
        p.box(bag, (0.9, 0.45, 0.3), (-9 + i * 2, 0.4, 2.95))
    p.finish()
    save("earth_bund")


def house(ruined=False):
    reset()
    wall = mat("plaster", "#ffffff", 0.95, image=tex_noise("tex_plaster", "#d8cdb2", "#b8a888", 21, 6, 6))
    roof = mat("roof_tile", "#ffffff", 0.8, image=tex_noise("tex_roof", "#9a4a2a", "#7c3a22", 2, 4, 20, stripes=16))
    dark = mat("opening", "#1a1612", 1.0)
    wood = mat("wood", "#5c3e22", 0.85)
    floor = mat("floor", "#8f8676", 1.0)
    p = Part("House", 0.5)
    W, D, H = 7.0, 5.0, 2.8
    p.box(floor, (W + 1.4, D + 1.4, 0.3), (0, 0, 0.15))
    if not ruined:
        p.box(wall, (W, D, H), (0, 0, 0.3 + H / 2))
        p.box(dark, (1.0, 0.05, 2.0), (0, -D / 2 - 0.01, 1.3))
        for x in (-2.3, 2.3):
            p.box(dark, (1.0, 0.05, 0.9), (x, -D / 2 - 0.01, 1.8))
            p.box(dark, (1.0, 0.05, 0.9), (x, D / 2 + 0.01, 1.8))
        p.cyl(roof, (W + 1.5) * 0.72, 1.9, (0, 0, 0.3 + H + 0.95), (0, 0, 45), seg=4, r2=0.6, smooth=False)
        for x in (-2.6, 2.6):
            p.cyl(wood, 0.08, H, (x, -D / 2 - 0.5, 0.3 + H / 2), seg=6)
    else:
        rnd = random.Random(7)
        segs = [((-W / 2 + 0.1, 0), (0.2, D)), ((W / 2 - 0.1, 0), (0.2, D)),
                ((-1.8, -D / 2 + 0.1), (3.4, 0.2)), ((2.0, D / 2 - 0.1), (3.0, 0.2))]
        for (x, y), (sx, sy) in segs:
            h = rnd.uniform(1.0, H)
            p.box(wall, (sx, sy, h), (x, y, 0.3 + h / 2))
        for i in range(14):
            p.ico(wall, rnd.uniform(0.2, 0.5), (rnd.uniform(-3, 3), rnd.uniform(-2, 2), 0.35), sub=0,
                  jitter=0.1, seed=i)
        for i in range(4):
            p.box(wood, (0.12, 3.5, 0.12), (rnd.uniform(-2, 2), rnd.uniform(-1, 1), 0.45),
                  (rnd.uniform(-10, 10), 0, rnd.uniform(0, 180)))
    p.finish()
    save("house_ruined" if ruined else "house")


def water_tower():
    """The Kilinochchi water tower, toppled in January 2009."""
    reset()
    conc = mat("concrete", "#ffffff", 0.95, image=tex_noise("tex_concrete", "#a9a59a", "#8a857a", 31, 8, 8))
    steel = mat("rebar", "#4a3b30", 0.6, 0.5)
    p = Part("WaterTower", 0.4)
    p.cyl(conc, 1.4, 5.0, (0, 0, 2.5), seg=12, smooth=False)
    p.cyl(conc, 1.2, 3.0, (0, 0, 5.4), seg=12, r2=0.9, smooth=False)
    for i in range(6):
        a = i / 6 * math.tau
        p.cyl(steel, 0.04, 1.2, (math.cos(a) * 1.0, math.sin(a) * 1.0, 7.2), (rnd_tilt(i), 0, 0), seg=4)
    # fallen column and tank lying on their side
    p.cyl(conc, 1.25, 14.0, (0, -9.8, 1.25), (90, 0, 0), seg=12, smooth=False)
    p.cyl(conc, 4.0, 5.0, (0.6, -18.5, 3.2), (82, 6, 0), seg=16, smooth=False)
    p.cyl(conc, 3.2, 1.2, (0.9, -21.4, 3.6), (82, 6, 0), seg=16, r2=1.5, smooth=False)
    rnd = random.Random(2)
    for i in range(18):
        p.ico(conc, rnd.uniform(0.3, 0.9), (rnd.uniform(-4, 4), rnd.uniform(-22, 2), 0.2), sub=0,
              jitter=0.2, seed=i)
    p.finish()
    save("water_tower")


def rnd_tilt(i):
    return (i * 37) % 30 - 15


def sluice_gate():
    """Mavil Aru anicut: a concrete weir across the canal with lift gates."""
    reset()
    conc = mat("concrete", "#ffffff", 0.95, image=tex_noise("tex_concrete2", "#9e9a8e", "#7d796e", 13, 8, 8))
    steel = mat("gate_steel", "#3d4a52", 0.5, 0.7)
    rust = mat("rust", "#6a3a1e", 0.8, 0.3)
    p = Part("Anicut", 0.4)
    p.box(conc, (16.0, 3.0, 1.2), (0, 0, 0.6))
    p.box(conc, (16.0, 1.6, 0.25), (0, 0, 3.8))
    for i in range(5):
        x = -6 + i * 3
        p.box(conc, (0.6, 2.4, 3.8), (x, 0, 1.9))
        if i < 4:
            p.box(steel, (2.3, 0.15, 2.0), (x + 1.5, 0.2, 1.8))
            p.cyl(rust, 0.05, 1.5, (x + 1.5, 0.2, 4.6), seg=6)
            p.cyl(rust, 0.35, 0.06, (x + 1.5, -0.2, 5.3), (90, 0, 0), seg=10)
    for x in (-8.0, 8.0):
        p.box(conc, (1.5, 4.0, 4.2), (x, 0, 2.1))
    p.finish()
    save("sluice_gate")


def coconut_palm():
    reset()
    bark = mat("palm_bark", "#ffffff", 1.0, image=tex_noise("tex_bark", "#6f5a42", "#55452f", 9, 4, 24, stripes=20))
    leaf = mat("palm_leaf", "#4f7a28", 0.8)
    nut = mat("coconut", "#5d6a1e", 0.7)
    p = Part("Palm", 0.8)
    x = y = 0.0
    z = 0.0
    lean = 0.0
    for i in range(8):
        lean += 2.2
        seg = 1.2
        r = 0.2 - i * 0.012
        dx = math.sin(math.radians(lean)) * seg
        p.cyl(bark, r, seg + 0.05, (x + dx / 2, 0, z + seg / 2), (0, lean, 0), seg=7, r2=r - 0.01)
        x += dx
        z += math.cos(math.radians(lean)) * seg
    top = (x, 0, z)
    for i in range(10):
        a = i / 10 * 360
        droop = 25 + (i % 3) * 12
        rad = math.radians(a)
        cx = top[0] + math.cos(rad) * 1.5
        cy = math.sin(rad) * 1.5
        p.box(leaf, (0.55, 3.2, 0.03), (cx, cy, top[2] - 0.35), (droop, 0, a - 90))
    for i in range(5):
        a = i / 5 * math.tau
        p.sphere(nut, 0.13, (top[0] + math.cos(a) * 0.22, math.sin(a) * 0.22, top[2] - 0.25), seg=6)
    p.finish()
    save("palm_coconut")


def palmyrah_palm():
    """Palmyrah, the signature tree of the Jaffna peninsula and Wanni."""
    reset()
    bark = mat("palmyrah_bark", "#ffffff", 1.0, image=tex_noise("tex_bark2", "#6a5a48", "#4a3f33", 19, 4, 24, stripes=24))
    leaf = mat("palmyrah_leaf", "#6a8a34", 0.85)
    dry = mat("dry_leaf", "#7a6a3a", 0.95)
    p = Part("Palmyrah", 0.8)
    p.cyl(bark, 0.26, 11.0, (0, 0, 5.5), seg=8, r2=0.2)
    rnd = random.Random(3)
    for i in range(16):
        a = rnd.uniform(0, 360)
        tilt = rnd.uniform(-60, 60)
        r = math.radians(a)
        p.cyl(leaf, 1.2, 0.04, (math.cos(r) * 0.9, math.sin(r) * 0.9, 11.5 + rnd.uniform(-0.3, 0.6)),
              (tilt, rnd.uniform(-40, 40), a), seg=9, smooth=False)
    for i in range(6):
        a = rnd.uniform(0, 360)
        r = math.radians(a)
        p.cyl(dry, 1.0, 0.04, (math.cos(r) * 0.5, math.sin(r) * 0.5, 10.3), (75, 0, a), seg=8, smooth=False)
    p.finish()
    save("palm_palmyrah")


def jungle_tree():
    reset()
    bark = mat("tree_bark", "#4d3a28", 1.0)
    leaf = mat("tree_leaf", "#3b5e22", 0.9)
    leaf2 = mat("tree_leaf2", "#4c6f2a", 0.9)
    p = Part("Tree", 0.8)
    p.cyl(bark, 0.35, 5.0, (0, 0, 2.5), seg=7, r2=0.22)
    p.cyl(bark, 0.12, 2.5, (0.7, 0, 4.4), (0, 35, 0), seg=5)
    p.cyl(bark, 0.12, 2.5, (-0.6, 0.3, 4.6), (0, -30, 20), seg=5)
    rnd = random.Random(5)
    for i in range(7):
        p.ico(leaf if i % 2 else leaf2, rnd.uniform(1.4, 2.2),
              (rnd.uniform(-1.6, 1.6), rnd.uniform(-1.6, 1.6), rnd.uniform(5.6, 7.5)),
              (1, 1, 0.7), sub=1, jitter=0.25, seed=i)
    p.finish()
    save("tree_jungle")


def bush():
    reset()
    leaf = mat("bush_leaf", "#47662a", 0.9)
    leaf2 = mat("bush_leaf2", "#5b7a30", 0.9)
    p = Part("Bush", 0.8)
    rnd = random.Random(8)
    for i in range(5):
        p.ico(leaf if i % 2 else leaf2, rnd.uniform(0.5, 0.9),
              (rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(0.3, 0.7)),
              (1, 1, 0.75), sub=1, jitter=0.12, seed=i)
    p.finish()
    save("bush")


def rock_outcrop():
    """Granite outcrop like Thoppigala ('Baron's Cap')."""
    reset()
    rock = mat("granite", "#ffffff", 0.9, image=tex_noise("tex_granite", "#7c776d", "#5e5a52", 17, 10, 10))
    p = Part("Rock", 0.15)
    p.ico(rock, 1.0, (0, 0, 4), (14, 11, 9), sub=2, jitter=0.12, seed=1)
    p.ico(rock, 1.0, (6, 4, 8), (6, 6, 7), sub=2, jitter=0.12, seed=2)
    p.ico(rock, 1.0, (-7, -3, 2), (6, 5, 4), sub=1, jitter=0.15, seed=3)
    p.finish()
    save("rock_outcrop")


def small_rock():
    reset()
    rock = mat("granite", "#ffffff", 0.9, image=tex_noise("tex_granite", "#7c776d", "#5e5a52", 17, 10, 10))
    p = Part("Stone", 0.5)
    p.ico(rock, 1.0, (0, 0, 0.3), (1.2, 0.9, 0.7), sub=1, jitter=0.15, seed=9)
    p.finish()
    save("rock_small")


def crates():
    reset()
    wood = mat("crate_wood", "#ffffff", 0.9, image=tex_noise("tex_crate", "#5f5a2e", "#4a4624", 6, 2, 16, stripes=6))
    drum = mat("drum", "#31452a", 0.6, 0.4)
    p = Part("Supplies", 1.5)
    p.box(wood, (1.0, 0.6, 0.5), (0, 0, 0.25))
    p.box(wood, (1.0, 0.6, 0.5), (0.1, 0.05, 0.75), (0, 0, 8))
    p.box(wood, (0.9, 0.6, 0.5), (0, 0.7, 0.25), (0, 0, -5))
    p.cyl(drum, 0.3, 0.9, (1.1, 0.4, 0.45), seg=12)
    p.cyl(drum, 0.3, 0.9, (1.15, -0.25, 0.45), seg=12)
    p.finish()
    save("supplies")


def sandbag_wall():
    reset()
    bag = mat("sandbag", "#ffffff", 1.0, image=tex_noise("tex_sandbag", "#8e7e5a", "#b2a27a", 3, 12, 12))
    p = Part("SandbagWall", 1.2)
    for row in range(3):
        for i in range(6):
            p.box(bag, (0.56, 0.36, 0.22), (-1.55 + i * 0.62 + (row % 2) * 0.31, 0, 0.12 + row * 0.25),
                  (0, (i * 7 + row * 3) % 9 - 4, (i * 5 + row) % 7 - 3))
    p.finish()
    save("sandbag_wall")


# --------------------------------------------------------------------------
# First-person weapons (Unity). Forward is -Y, origin at the weapon's grip,
# with "Muzzle" at the barrel tip and "Sight" on the line of sight.
# --------------------------------------------------------------------------

def fp_arms(p, cloth, skin_m, right_hand, left_hand):
    """Forearms reaching from below the camera to each hand."""
    for hand, side in ((right_hand, 1), (left_hand, -1)):
        hx, hy, hz = hand
        p.sphere(skin_m, 0.045, (hx, hy, hz), (1.0, 1.3, 0.8), seg=8)
        elbow = (hx + side * 0.12, hy + 0.32, hz - 0.16)
        mid = [(a + b) / 2 for a, b in zip(hand, elbow)]
        dx, dy, dz = (elbow[0] - hx, elbow[1] - hy, elbow[2] - hz)
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        pitch = math.degrees(math.atan2(dz, math.hypot(dx, dy)))
        yaw = math.degrees(math.atan2(dx, dy))
        p.box(skin_m, (0.07, length * 0.45, 0.065), (hx + dx * 0.25, hy + dy * 0.25, hz + dz * 0.25), (pitch, 0, -yaw))
        p.box(cloth, (0.1, length * 0.65, 0.095), (mid[0] + dx * 0.2, mid[1] + dy * 0.2, mid[2] + dz * 0.2), (pitch, 0, -yaw))


def fp_weapon(name, build):
    reset()
    cloth = mat("sleeve", "#ffffff", 0.95, image=tex_army_dpm())
    skin_m = mat("skin", "#6e4a30", 0.7)
    root = empty(name)
    p = Part("Weapon", 4.0)
    muzzle, sight, hands = build(p)
    fp_arms(p, cloth, skin_m, *hands)
    ob = p.finish(root)
    empty("Muzzle", ob, muzzle)
    empty("Sight", ob, sight)
    save(name)


def build_t56(p):
    metal = mat("gun_metal", "#2a2c2f", 0.4, 0.85)
    wood = mat("gun_wood", "#7a4523", 0.55)
    p.box(metal, (0.048, 0.32, 0.07), (0, -0.05, 0.03))
    p.box(metal, (0.044, 0.30, 0.012), (0, -0.05, 0.071))
    p.box(metal, (0.016, 0.03, 0.03), (0, 0.0, 0.085))
    p.cyl(metal, 0.012, 0.42, (0, -0.47, 0.045), (90, 0, 0), seg=10)
    p.cyl(metal, 0.016, 0.06, (0, -0.68, 0.045), (90, 0, 0), seg=10)
    p.cyl(metal, 0.011, 0.24, (0, -0.33, 0.078), (90, 0, 0), seg=8)
    p.box(metal, (0.01, 0.015, 0.05), (0, -0.62, 0.085))
    p.box(wood, (0.058, 0.2, 0.07), (0, -0.33, 0.04))
    p.box(wood, (0.05, 0.12, 0.035), (0, -0.33, 0.085))
    p.box(wood, (0.045, 0.3, 0.075), (0, 0.27, 0.0), (-6, 0, 0))
    p.box(wood, (0.04, 0.05, 0.11), (0, 0.06, -0.05), (-18, 0, 0))
    p.box(metal, (0.036, 0.07, 0.19), (0, -0.14, -0.06), (20, 0, 0))
    p.box(metal, (0.036, 0.07, 0.1), (0, -0.19, -0.17), (32, 0, 0))
    p.box(metal, (0.02, 0.06, 0.025), (0, -0.02, -0.005))
    return (0, -0.71, 0.045), (0, 0.0, 0.097), ((0, 0.06, -0.06), (0, -0.33, -0.005))


def build_pistol(p):
    metal = mat("pistol_metal", "#1d1f22", 0.35, 0.85)
    grip = mat("pistol_grip", "#2a2420", 0.7)
    p.box(metal, (0.03, 0.19, 0.035), (0, -0.05, 0.06))
    p.box(metal, (0.028, 0.16, 0.03), (0, -0.04, 0.03))
    p.box(grip, (0.032, 0.05, 0.11), (0, 0.03, -0.03), (-14, 0, 0))
    p.box(metal, (0.008, 0.012, 0.012), (0, -0.135, 0.083))
    p.box(metal, (0.022, 0.012, 0.012), (0, 0.035, 0.083))
    p.cyl(metal, 0.018, 0.18, (0, -0.24, 0.055), (90, 0, 0), seg=12)
    return (0, -0.33, 0.055), (0, 0.0, 0.089), ((0.0, 0.04, -0.05), (-0.01, 0.0, -0.07))


def build_svd(p):
    metal = mat("svd_metal", "#26282b", 0.4, 0.85)
    wood = mat("svd_wood", "#6e3b1c", 0.55)
    scope = mat("scope", "#141516", 0.3, 0.6)
    glass = mat("scope_glass", "#2b4a5c", 0.05, 0.4)
    p.box(metal, (0.046, 0.3, 0.068), (0, -0.05, 0.03))
    p.cyl(metal, 0.012, 0.62, (0, -0.52, 0.045), (90, 0, 0), seg=10)
    p.cyl(metal, 0.017, 0.08, (0, -0.85, 0.045), (90, 0, 0), seg=10)
    p.box(wood, (0.056, 0.26, 0.07), (0, -0.33, 0.04))
    p.box(wood, (0.04, 0.34, 0.03), (0, 0.27, 0.06), (-4, 0, 0))
    p.box(wood, (0.045, 0.3, 0.035), (0, 0.27, -0.06), (8, 0, 0))
    p.box(wood, (0.045, 0.05, 0.13), (0, 0.42, 0.0))
    p.box(wood, (0.04, 0.05, 0.11), (0, 0.06, -0.05), (-18, 0, 0))
    p.box(metal, (0.034, 0.08, 0.13), (0, -0.14, -0.05), (10, 0, 0))
    p.cyl(scope, 0.019, 0.26, (0, -0.03, 0.135), (90, 0, 0), seg=14)
    p.cyl(scope, 0.026, 0.06, (0, -0.17, 0.135), (90, 0, 0), seg=14)
    p.cyl(scope, 0.023, 0.05, (0, 0.11, 0.135), (90, 0, 0), seg=14)
    p.cyl(glass, 0.02, 0.005, (0, 0.137, 0.135), (90, 0, 0), seg=14)
    p.box(metal, (0.02, 0.1, 0.05), (0, -0.03, 0.09))
    return (0, -0.9, 0.045), (0, 0.0, 0.135), ((0, 0.06, -0.06), (0, -0.36, -0.005))


def weapon_model(name, build):
    """Weapon on its own (third-person), origin at the grip, with a Muzzle empty."""
    reset()
    p = Part("Weapon", 4.0)
    muzzle, _, _ = build(p)
    ob = p.finish(empty(name))
    empty("Muzzle", ob, muzzle)
    save(name)


def helicopter():
    """Bell 212-style utility helicopter in air force olive camouflage."""
    reset()
    camo_m = mat("heli_camo", "#ffffff", 0.7, image=tex_vehicle())
    dark = mat("heli_dark", "#1c1f1a", 0.5, 0.4)
    glass = mat("heli_glass", "#24343c", 0.1, 0.5)
    metal = mat("heli_metal", "#3a3d38", 0.4, 0.7)
    root = empty("Helicopter")
    body = Part("Body", 0.35)
    body.box(camo_m, (2.3, 4.2, 2.0), (0, 0, 1.6))
    body.prism(camo_m, 1.6, 2.3, 1.2, 1.8, (0, -2.85, 0.7), (6, 0, 0))
    body.box(glass, (2.0, 1.2, 0.9), (0, -2.9, 2.0), (-20, 0, 0))
    body.box(dark, (0.05, 1.8, 1.3), (1.16, -0.2, 1.5))
    body.box(dark, (0.05, 1.8, 1.3), (-1.16, -0.2, 1.5))
    body.box(camo_m, (1.4, 2.0, 0.6), (0, 0.6, 2.85))
    body.cyl(camo_m, 0.45, 6.5, (0, 5.2, 2.2), (90, 0, 0), seg=10, r2=0.22)
    body.box(camo_m, (0.12, 1.2, 1.6), (0, 8.2, 2.9), (-25, 0, 0))
    body.box(camo_m, (1.8, 0.5, 0.08), (0, 6.8, 2.2))
    for x in (-1.1, 1.1):
        body.cyl(metal, 0.06, 4.6, (x, -0.3, 0.12), (90, 0, 0), seg=6)
        for y in (-1.3, 0.9):
            body.cyl(metal, 0.05, 0.7, (x * 0.85, y, 0.45), (0, x * 18, 0), seg=6)
    body.cyl(metal, 0.12, 0.6, (0, 0.2, 3.35), seg=8)
    body.finish(root)
    rotor = Part("Rotor", 1.0)
    rotor.cyl(metal, 0.25, 0.2, (0, 0, 0), seg=8)
    for a in (0, 90):
        rotor.box(dark, (0.4, 14.0, 0.05), (0, 0, 0.05), (0, 0, a))
    rotor.finish(root, (0, 0.2, 3.7))
    tail = Part("TailRotor", 1.0)
    tail.box(dark, (0.04, 0.22, 2.4), (0, 0, 0))
    tail.box(dark, (0.04, 2.4, 0.22), (0, 0, 0))
    tail.finish(root, (0.2, 8.6, 3.2))
    save("helicopter")


def arrow_boat():
    """Navy 'Arrow' fast inshore boat with twin outboards and a bow gun."""
    reset()
    hull = mat("arrow_hull", "#5d6b73", 0.45)
    deck = mat("arrow_deck", "#3a4247", 0.7)
    eng = mat("arrow_engine", "#141414", 0.4, 0.5)
    p = Part("Boat", 0.4)
    p.prism(hull, 5.4, 0.5, 2.2, 0.8, (0, 0.4, 0))
    p.prism(hull, 1.8, 0.2, 2.2, 0.8, (0, -3.0, 0.1), (8, 0, 0))
    p.box(deck, (2.0, 5.2, 0.06), (0, 0.4, 0.82))
    p.box(deck, (1.0, 0.6, 0.6), (0, 0.2, 1.15))
    p.cyl(eng, 0.03, 0.9, (0, -2.4, 1.3), (90, 0, 0), seg=6)
    p.box(eng, (0.2, 0.35, 0.3), (0, -1.9, 1.15))
    for x in (-0.45, 0.45):
        p.box(eng, (0.35, 0.45, 0.6), (x, 3.25, 0.95))
        p.box(eng, (0.12, 0.15, 0.7), (x, 3.35, 0.3))
    p.finish()
    save("arrow_boat")


def grenade():
    reset()
    body = mat("grenade_body", "#3b4a2c", 0.6, 0.2)
    metal = mat("grenade_metal", "#8a8a80", 0.4, 0.8)
    p = Part("Grenade", 8)
    p.sphere(body, 0.035, (0, 0, 0), (1, 1, 1.25), seg=12)
    p.cyl(metal, 0.014, 0.025, (0, 0, 0.05), seg=8)
    p.box(metal, (0.01, 0.06, 0.008), (0, 0.02, 0.035), (-30, 0, 0))
    p.cyl(metal, 0.012, 0.004, (0.018, 0, 0.06), (0, 90, 0), seg=8)
    p.finish()
    save("grenade")


def watchtower():
    """Log sentry tower of the kind used at LTTE camps and FDLs."""
    reset()
    log = mat("tower_log", "#ffffff", 0.95, image=tex_noise("tex_bark2", "#6a5a48", "#4a3f33", 19, 4, 24, stripes=24))
    plank = mat("plank", "#6b5232", 0.9)
    bag = mat("sandbag", "#ffffff", 1.0, image=tex_noise("tex_sandbag", "#8e7e5a", "#b2a27a", 3, 12, 12))
    thatch = mat("thatch", "#8a7448", 1.0)
    p = Part("Tower", 1.0)
    H = 5.0
    for x in (-1.3, 1.3):
        for y in (-1.3, 1.3):
            p.cyl(log, 0.12, H + 2.4, (x * 0.92, y * 0.92, (H + 2.4) / 2), (y * 2.5, -x * 2.5, 0), seg=7)
    for z in (1.4, 3.0):
        for i, rot in enumerate((0, 90)):
            p.cyl(log, 0.07, 3.6, (0, 0, z), (45 if i else -45, 0, rot), seg=5)
    p.box(plank, (3.0, 3.0, 0.12), (0, 0, H))
    for i in range(14):
        a = i / 14 * math.tau
        if -0.4 < math.sin(a) < 0.4 and math.cos(a) > 0:
            continue
        p.box(bag, (0.6, 0.3, 0.22), (math.cos(a) * 1.35, math.sin(a) * 1.35, H + 0.17), (0, 0, math.degrees(a) + 90))
        p.box(bag, (0.6, 0.3, 0.22), (math.cos(a + 0.2) * 1.35, math.sin(a + 0.2) * 1.35, H + 0.39), (0, 0, math.degrees(a + 0.2) + 90))
    p.cyl(thatch, 2.4, 0.9, (0, 0, H + 2.6), seg=4, r2=0.1, smooth=False)
    for i in range(9):
        p.box(plank, (0.5, 0.06, 0.05), (1.5, 1.2, 0.4 + i * 0.55))
    p.box(plank, (0.06, 0.06, H), (1.75, 1.2, H / 2))
    p.box(plank, (0.06, 0.06, H), (1.25, 1.2, H / 2))
    p.finish()
    save("watchtower")


def alarm():
    """Camp alarm: siren on a pole with a switch box."""
    reset()
    metal = mat("alarm_pole", "#4a4d4f", 0.5, 0.7)
    red = mat("alarm_red", "#b02a1e", 0.4, 0.3)
    box_m = mat("alarm_box", "#5a6a4a", 0.6, 0.4)
    p = Part("Alarm", 2.0)
    p.cyl(metal, 0.05, 3.2, (0, 0, 1.6), seg=8)
    p.cyl(red, 0.16, 0.35, (0, -0.1, 3.1), (90, 0, 0), seg=12, r2=0.06)
    p.cyl(red, 0.09, 0.2, (0, 0.1, 3.1), (90, 0, 0), seg=10)
    p.box(box_m, (0.35, 0.18, 0.45), (0, -0.12, 1.3))
    p.box(red, (0.06, 0.04, 0.12), (0, -0.22, 1.34))
    p.cyl(metal, 0.01, 1.6, (0, -0.02, 2.2), seg=4)
    p.finish()
    save("alarm")


def terrain_textures():
    """Ground textures (albedo + normal map) for the Unity terrain."""
    os.makedirs(UNITY_TEX, exist_ok=True)
    N = 512
    specs = {
        "ground_grass": ("#4f6b2a", "#6f8a35", "#3a5220", 21),
        "ground_drygrass": ("#8a8248", "#a59a5a", "#6d6634", 22),
        "ground_dirt": ("#6e5236", "#8a6a46", "#4e3a26", 23),
        "ground_sand": ("#b8a47a", "#cdbb90", "#9c8a62", 24),
        "ground_mud": ("#4e4532", "#615641", "#3a3324", 25),
        "ground_paddy": ("#6f9a32", "#8fb640", "#527428", 26),
    }
    for name, (c1, c2, c3, seed) in specs.items():
        big = fbm(N, N, 6, 6, seed, 5)
        fine = fbm(N, N, 48, 48, seed + 1, 3)
        streak = fbm(N, N, 96, 12, seed + 2, 2)
        h = big * 0.5 + fine * 0.35 + streak * 0.15
        a, b, c = (np.array(hex_rgb(x)) for x in (c1, c2, c3))
        rgb = a * (1 - big[..., None]) + b * big[..., None]
        rgb = rgb * (1 - (fine[..., None] < 0.38) * 0.5) + c * ((fine[..., None] < 0.38) * 0.5)
        rgb *= (0.85 + streak[..., None] * 0.3)
        save_png(name, np.clip(rgb, 0, 1))
        gy, gx = np.gradient(h * 6.0)
        nrm = np.stack([-gx, -gy, np.ones_like(h)], axis=2)
        nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
        save_png(name + "_n", nrm * 0.5 + 0.5)
    # grass blade billboard with alpha for terrain detail
    rng = np.random.default_rng(5)
    W, Hh = 128, 128
    rgba = np.zeros((Hh, W, 4))
    for i in range(26):
        x0 = rng.uniform(10, W - 10)
        top = rng.uniform(0.45, 0.98) * Hh
        lean = rng.uniform(-18, 18)
        width = rng.uniform(2.0, 3.5)
        col = np.array(hex_rgb(["#5d7a2e", "#7a9a3a", "#8a9a48", "#4e6a26"][i % 4]))
        for y in range(int(top)):
            t = y / top
            x = x0 + lean * t * t
            w = width * (1 - t) + 0.4
            xs = np.arange(max(0, int(x - w)), min(W, int(x + w) + 1))
            rgba[y, xs, :3] = col * (0.6 + 0.4 * t)
            rgba[y, xs, 3] = 1.0
    save_png("grass_blade", rgba, alpha=True)


def save_png(name, arr, alpha=False):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha)
    if not alpha:
        arr = np.concatenate([arr, np.ones((h, w, 1))], axis=2)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = os.path.join(UNITY_TEX, name + ".png")
    img.file_format = "PNG"
    img.save()


BUILDERS = [
    lambda: soldier("soldier_army", tex_army_dpm, "#6e4a30", "army"),
    lambda: soldier("soldier_ltte", tex_tiger_stripe, "#5e3e28", "ltte"),
    lambda: soldier("soldier_sf", tex_army_dpm, "#6e4a30", "army", hat="boonie", paint=True),
    lambda: soldier("soldier_ghillie", tex_army_dpm, "#6a4630", "army", hat="boonie", paint=True, ghillie=True, weapon="svd"),
    lambda: weapon_model("wpn_svd", build_svd),
    lambda: weapon_model("wpn_pistol", build_pistol),
    helicopter, arrow_boat,
    civilian, buffel, sea_tiger_boat, bunker, earth_bund,
    lambda: house(False), lambda: house(True),
    water_tower, sluice_gate, coconut_palm, palmyrah_palm, jungle_tree, bush,
    rock_outcrop, small_rock, crates, sandbag_wall,
    lambda: fp_weapon("fp_t56", build_t56),
    lambda: fp_weapon("fp_pistol", build_pistol),
    lambda: fp_weapon("fp_svd", build_svd),
    grenade, watchtower, alarm,
]


if __name__ == "__main__":
    import json
    for build in BUILDERS:
        build()
    reset()
    terrain_textures()
    with open(os.path.join(UNITY_RES, "materials.json"), "w") as f:
        json.dump(UNITY_MATERIALS, f, indent=1)
