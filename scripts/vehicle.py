"""Original procedural sports coupe for Blender 4.3+.

All geometry is local to the returned root: +Z up, -Y forward, wheels on Z=0.
No downloaded assets, images, add-ons or external Python dependencies are used.
"""

import math

import bpy


def _material(name, color, metallic=0.0, roughness=0.35, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color[:3], 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color[:3], 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if metallic:
        bsdf.inputs["Coat Weight"].default_value = 0.5
        bsdf.inputs["Coat Roughness"].default_value = 0.18
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color[:3], 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def create_car(name="Hero", color=(0.025, 0.65, 0.58), collection=None):
    """Create a detailed, editable 2.35 × 4.72 × 1.36 m sports coupe.

    ``root = create_car(); root.location = (0, 0, 0.05)``
    A supplied collection is used for the root and all child geometry. Four
    child empties have ``wheel_radius = 0.43``; animate their X rotation to roll.
    """
    collection = collection or bpy.context.collection
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.8
    root["asset"] = "Original Coastal GT sports coupe"
    root["forward_axis"] = "-Y"

    paint = _material(name + " / satin metallic paint", color, 0.72, 0.24)
    dark = _material(name + " / carbon", (0.012, 0.019, 0.025), 0.25, 0.3)
    rubber = _material(name + " / rubber", (0.013, 0.016, 0.018), 0.0, 0.72)
    glass = _material(name + " / smoked glass", (0.025, 0.065, 0.085), 0.65, 0.12)
    alloy = _material(name + " / machined alloy", (0.56, 0.62, 0.67), 0.9, 0.2)
    rotor = _material(name + " / brake rotors", (0.13, 0.17, 0.19), 0.8, 0.4)
    caliper = _material(name + " / coral calipers", (0.95, 0.13, 0.045), 0.4, 0.3)
    led = _material(name + " / LED white", (0.66, 0.9, 1.0), emission=4)
    red = _material(name + " / tail LED", (1.0, 0.018, 0.035), emission=4)
    amber = _material(name + " / indicators", (1.0, 0.3, 0.025), emission=2)

    def finish(obj, label, mat, bevel=0.0, smooth=False):
        obj.name = name + " / " + label
        for linked in list(obj.users_collection):
            linked.objects.unlink(obj)
        collection.objects.link(obj)
        obj.parent = root
        obj.data.materials.append(mat)
        if smooth:
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        if bevel:
            mod = obj.modifiers.new("Soft manufactured edges", "BEVEL")
            mod.width = bevel
            mod.segments = 3
            mod = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
            mod.keep_sharp = True
        return obj

    def cube(label, position, dimensions, mat=paint, bevel=0.025, rotation=None):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if rotation:
            obj.rotation_euler = rotation
        return finish(obj, label, mat, bevel)

    def mesh(label, vertices, faces, mat=paint, bevel=0.015):
        data = bpy.data.meshes.new(name + " / " + label)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(label, data)
        collection.objects.link(obj)
        return finish(obj, label, mat, bevel)

    def cylinder(label, position, radius, depth, mat, rotation=(0, math.pi / 2, 0)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth,
                                            location=position, rotation=rotation)
        return finish(bpy.context.object, label, mat, 0.008, True)

    def torus(label, position, major, minor, mat):
        bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=12,
                                        major_radius=major, minor_radius=minor,
                                        location=position, rotation=(0, math.pi / 2, 0))
        return finish(bpy.context.object, label, mat, smooth=True)

    # A six-section hand-shaped monocoque: narrow nose, muscular shoulders.
    # Each cross section runs around X/Z; Y is the longitudinal axis.
    sections = [
        (-2.26, 0.82, 0.38, 0.62),
        (-1.76, 1.00, 0.37, 0.75),
        (-0.78, 0.98, 0.34, 0.83),
        (0.72, 0.98, 0.34, 0.84),
        (1.66, 1.03, 0.38, 0.89),
        (2.20, 0.94, 0.43, 0.82),
    ]
    verts = []
    for y, w, low, high in sections:
        verts += [(-w * 0.94, y, low), (w * 0.94, y, low),
                  (w, y, high - 0.11), (w * 0.81, y, high),
                  (-w * 0.81, y, high), (-w, y, high - 0.11)]
    faces = [tuple(range(6))]
    for i in range(len(sections) - 1):
        for j in range(6):
            faces.append(((i + 1) * 6 + j, (i + 1) * 6 + (j + 1) % 6,
                          i * 6 + (j + 1) % 6, i * 6 + j))
    faces.append(tuple(reversed(range(30, 36))))
    mesh("sculpted monocoque", verts, faces, paint, 0.045)
    cube("carbon underbody", (0, 0, 0.33), (1.82, 4.30, 0.13), dark, 0.055)
    cube("front splitter", (0, -2.23, 0.32), (1.98, 0.30, 0.10), dark, 0.025)
    cube("rear diffuser", (0, 2.20, 0.40), (1.96, 0.27, 0.16), dark, 0.025)

    # Compact cabin with individual glass panels and painted frame members.
    cabin = [(-0.77, -0.79, 0.82), (0.77, -0.79, 0.82),
             (0.60, -0.26, 1.31), (-0.60, -0.26, 1.31),
             (-0.57, 0.68, 1.33), (0.57, 0.68, 1.33),
             (0.76, 1.20, 0.87), (-0.76, 1.20, 0.87)]
    mesh("windshield", [cabin[i] for i in (0, 1, 2, 3)], [(0, 1, 2, 3)], glass)
    mesh("roof", [cabin[i] for i in (3, 2, 5, 4)], [(0, 1, 2, 3)], paint, 0.025)
    mesh("rear glass", [cabin[i] for i in (4, 5, 6, 7)], [(0, 1, 2, 3)], glass)
    for side in (-1, 1):
        mesh("side glass", [(side * 0.78, -0.70, 0.84),
                            (side * 0.60, -0.23, 1.29),
                            (side * 0.58, 0.64, 1.31),
                            (side * 0.76, 1.10, 0.88)],
             [(0, 1, 2, 3) if side < 0 else (3, 2, 1, 0)], glass)
        cube("window sill", (side * 0.805, 0.20, 0.848), (0.045, 1.78, 0.036), dark, 0.01)
        cube("B pillar", (side * 0.672, 0.43, 1.075), (0.055, 0.075, 0.45), dark,
             0.01, (0, side * 0.40, 0))
        cube("rocker panel", (side * 1.00, 0, 0.36), (0.12, 2.10, 0.15), dark)
        cube("door handle", (side * 0.988, 0.35, 0.76), (0.025, 0.23, 0.045), alloy, 0.01)
        cube("mirror arm", (side * 0.91, -0.55, 0.93), (0.24, 0.065, 0.045), dark)
        cube("wing mirror", (side * 1.11, -0.53, 0.98), (0.21, 0.28, 0.11), paint, 0.045)
        cube("mirror glass", (side * 1.11, -0.383, 0.98), (0.17, 0.012, 0.073), alloy, 0.012)
        # Side intake just ahead of the rear axle.
        mesh("side air intake", [(side * 0.991, 0.58, 0.48),
                                 (side * 1.007, 1.07, 0.48),
                                 (side * 1.01, 1.07, 0.72),
                                 (side * 0.99, 0.80, 0.67)],
             [(0, 1, 2, 3) if side > 0 else (3, 2, 1, 0)], dark)
        for y in (0.79, 0.94):
            cube("intake fin", (side * 1.017, y, 0.57), (0.025, 0.035, 0.14), paint, 0.005)

    # Dark lamp housings, paired ice-blue DRLs, recessed front intakes.
    for side in (-1, 1):
        cube("headlight socket", (side * 0.60, -2.176, 0.635), (0.46, 0.15, 0.105), dark)
        for z in (0.626, 0.665):
            cube("headlight LED", (side * 0.60, -2.258, z), (0.39, 0.012, 0.014), led, 0.005)
        cube("front intake", (side * 0.62, -2.288, 0.465), (0.40, 0.025, 0.14), dark)
        cube("amber marker", (side * 0.873, -1.92, 0.575), (0.018, 0.17, 0.035), amber, 0.01)
        cube("hood vent", (side * 0.53, -1.29, 0.806), (0.20, 0.43, 0.016), dark, 0.015,
             (0.075, 0, 0))
        for y in (-1.39, -1.27, -1.15):
            cube("hood vent louver", (side * 0.53, y, 0.82), (0.19, 0.021, 0.015), paint, 0.003)
    cube("front central intake", (0, -2.291, 0.466), (0.57, 0.025, 0.12), dark)
    cube("nose badge", (0, -2.02, 0.694), (0.07, 0.10, 0.012), alloy, 0.01)
    cube("rear light housing", (0, 2.212, 0.72), (1.77, 0.03, 0.13), dark, 0.02)
    cube("full-width rear LED", (0, 2.235, 0.748), (1.65, 0.016, 0.026), red, 0.01)
    cube("number plate", (0, 2.239, 0.56), (0.42, 0.016, 0.13), alloy, 0.01)
    for x in (-0.68, -0.34, 0, 0.34, 0.68):
        cube("diffuser vane", (x, 2.18, 0.315), (0.035, 0.45, 0.11), dark, 0.008)
    for x in (-0.77, 0.77):
        cylinder("exhaust metal", (x, 2.30, 0.455), 0.085, 0.13, alloy, (math.pi / 2, 0, 0))
        cylinder("exhaust recess", (x, 2.374, 0.455), 0.064, 0.01, dark, (math.pi / 2, 0, 0))
    # Low ducktail spoiler keeps the rear silhouette elegant.
    cube("ducktail wing", (0, 1.99, 0.95), (1.96, 0.26, 0.065), paint, 0.025,
         (-0.09, 0, 0))
    for x in (-0.64, 0.64):
        cube("wing bracket", (x, 1.99, 0.88), (0.05, 0.15, 0.10), dark)

    for side in (-1, 1):
        for y in (-1.43, 1.42):
            wheel = bpy.data.objects.new(
                f"{name} / Wheel {side} {'front' if y < 0 else 'rear'}", None)
            collection.objects.link(wheel)
            wheel.parent = root
            wheel.location = (side * 1.06, y, 0.43)
            wheel.empty_display_type = "PLAIN_AXES"
            wheel.empty_display_size = 0.22
            wheel["wheel_radius"] = 0.43
            wheel_parts = []
            pos = (side * 1.005, y, 0.43)
            wheel_parts.append(torus("performance tire", pos, 0.325, 0.105, rubber))
            wheel_parts.append(cylinder("rim barrel", (side * 1.06, y, 0.43), 0.307, 0.12, dark))
            wheel_parts.append(cylinder("brake disc", (side * 1.115, y, 0.43), 0.255, 0.018, rotor))
            cube("brake caliper", (side * 1.13, y + 0.19, 0.43), (0.035, 0.09, 0.23), caliper, 0.018)
            wheel_parts.append(torus("polished rim lip", (side * 1.147, y, 0.43), 0.285, 0.014, alloy))
            for spoke in range(5):
                angle = spoke * math.tau / 5
                spoke_obj = cube("forged alloy spoke",
                                 (side * 1.15, y + math.sin(angle) * 0.15,
                                  0.43 + math.cos(angle) * 0.15),
                                 (0.032, 0.048, 0.26), alloy, 0.009)
                spoke_obj.rotation_euler.x = -angle
                wheel_parts.append(spoke_obj)
            wheel_parts.append(cylinder("wheel center cap", (side * 1.17, y, 0.43), 0.067, 0.024, dark))
            # The new pivot axes are identity, so subtracting its local origin
            # preserves every child's placement without a parent inverse.
            for part in wheel_parts:
                part.parent = wheel
                part.location -= wheel.location

    return root
