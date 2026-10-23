"""Validate a saved Blender project without changing the file on disk.

Usage:
    blender -b scenes/sunset_coast.blend --python-exit-code 1 \
        --python scripts/validate_scene.py
"""
import json
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
scene = bpy.context.scene
errors = []
checks = {}


def require(name, condition, detail=None):
    checks[name] = {"passed": bool(condition)}
    if detail is not None:
        checks[name]["detail"] = detail
    if not condition:
        errors.append(name)


require("saved_project_loaded", bool(bpy.data.filepath))
cameras = [obj for obj in scene.objects if obj.type == "CAMERA"]
require("active_render_camera", scene.camera in cameras if scene.camera else False)
require("three_camera_views", len(cameras) >= 3, [obj.name for obj in cameras])
require("animation_duration", (scene.frame_start, scene.frame_end, scene.render.fps,
                                scene.render.fps_base) == (1, 240, 24, 1.0))
require("render_dimensions", scene.render.resolution_x > 0 and scene.render.resolution_y > 0)
require("render_materials", bool(bpy.data.materials) and scene.world is not None)

invalid_objects = []
for obj in scene.objects:
    if not all(math.isfinite(component) for row in obj.matrix_world for component in row):
        invalid_objects.append(obj.name)
require("finite_object_transforms", not invalid_objects, invalid_objects)

invalid_meshes = []
vertex_count = 0
polygon_count = 0
for data in bpy.data.meshes:
    if not data.users:
        continue
    vertex_count += len(data.vertices)
    polygon_count += len(data.polygons)
    if any(not math.isfinite(component) for vertex in data.vertices for component in vertex.co):
        invalid_meshes.append(data.name)
require("finite_mesh_geometry", not invalid_meshes, invalid_meshes)
require("scene_has_geometry", vertex_count > 0 and polygon_count > 0)

missing = []
unpacked = []
for category, datablocks in (("image", bpy.data.images), ("font", bpy.data.fonts),
                            ("sound", bpy.data.sounds), ("library", bpy.data.libraries)):
    for data in datablocks:
        if not data.users:
            continue
        filepath = getattr(data, "filepath", "")
        if not filepath or filepath == "<builtin>":
            continue
        if category == "image" and data.source in {"GENERATED", "VIEWER"}:
            continue
        is_packed = bool(getattr(data, "packed_file", None) or getattr(data, "packed_files", []))
        if is_packed:
            continue
        label = f"{category}: {data.name}"
        unpacked.append(label)
        if not Path(bpy.path.abspath(filepath)).exists():
            missing.append(label)
require("no_missing_external_resources", not missing, missing)
require("portable_resources_packed", not unpacked, unpacked)

original_frame = scene.frame_current
hero_candidates = [obj for obj in scene.objects if obj.type == "EMPTY"
                   and obj.get("asset") == "Original Coastal GT sports coupe"
                   and obj.animation_data and obj.animation_data.action]
require("animated_hero_vehicle", len(hero_candidates) == 1)
if len(hero_candidates) == 1 and scene.camera:
    hero = hero_candidates[0]
    wheels = [obj for obj in hero.children
              if obj.type == "EMPTY" and "wheel_radius" in obj]
    require("four_hero_wheel_groups", len(wheels) == 4,
            [{"name": obj.name, "wheel_radius": obj["wheel_radius"]} for obj in wheels])
    scene.frame_set(scene.frame_start)
    start_wheels = {obj.name: float(obj.rotation_euler.x) for obj in wheels}
    start_car = hero.matrix_world.translation.copy()
    start_camera = scene.camera.matrix_world.translation.copy()
    scene.frame_set(scene.frame_end)
    end_car = hero.matrix_world.translation.copy()
    end_camera = scene.camera.matrix_world.translation.copy()
    wheel_details = [
        {"name": obj.name,
         "wheel_radius": obj["wheel_radius"],
         "start_rotation_x": start_wheels[obj.name],
         "end_rotation_x": float(obj.rotation_euler.x)}
        for obj in wheels
    ]
    require("all_hero_wheels_rotate", len(wheels) == 4 and all(
        math.isfinite(item["start_rotation_x"])
        and math.isfinite(item["end_rotation_x"])
        and abs(item["end_rotation_x"] - item["start_rotation_x"]) > 1e-6
        for item in wheel_details), wheel_details)
    require("hero_moves_during_sequence", (end_car - start_car).length > 1.0,
            {"start": list(start_car), "end": list(end_car)})
    require("camera_moves_during_sequence", (end_camera - start_camera).length > 1.0,
            {"start": list(start_camera), "end": list(end_camera)})
scene.frame_set(original_frame)

report = {
    "status": "passed" if not errors else "failed",
    "blender_version": bpy.app.version_string,
    "project": Path(bpy.data.filepath).name if bpy.data.filepath else None,
    "object_count": len(scene.objects),
    "mesh_vertices": vertex_count,
    "mesh_polygons": polygon_count,
    "camera_count": len(cameras),
    "checks": checks,
    "errors": errors,
}
output = ROOT / "previews" / "validation.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
if errors:
    raise RuntimeError("Scene validation failed: " + ", ".join(errors))
print("VALIDATION_OK")
