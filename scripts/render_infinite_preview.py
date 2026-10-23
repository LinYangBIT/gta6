"""Render an editable Blender snapshot exported from the real browser city.

node scripts/export_infinite_preview.mjs --output /tmp/endless-city.json
blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- \
  --input /tmp/endless-city.json --output previews/endless_city.png

The live city is infinite; this preview contains only its bounded nearby cells.
Facade window masks are baked offline from the browser shader; GPU precision,
lighting and postprocessing can differ. This is not a browser screenshot.
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path('previews/endless_city.png'))
parser.add_argument('--blend', type=Path)
parser.add_argument('--resolution', type=int, default=1200)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
data = json.loads(args.input.read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Convert Three.js Y-up world positions into Blender Z-up coordinates.
convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
groups = defaultdict(lambda: {'vertices': [], 'faces': [], 'uv': []})
materials = {}


def facade_images(key, name):
    """Bake the browser shader's UV window mask for this offline preview only."""
    import numpy as np
    rgb, _, _, _, _, facade = key
    style, width, height, seed = facade
    resolution = 256 if height < 80 else 512
    uv = (np.arange(resolution, dtype=np.float32) + .5) / resolution
    u, v = np.meshgrid(uv, uv)
    cells_x, cells_y = max(2, math.floor(width / 3)), max(1, math.floor(height / 3.4))
    fu, fv = u * cells_x, v * cells_y
    pu, pv = fu % 1, fv % 1
    border = .055 if style == 'glass' else .19
    mask = ((pu >= border) & (pu <= 1-border) & (pv >= .23) & (pv <= .82)
            & (u >= .045) & (u <= .955) & (v >= 3.4 / height) & (v <= 1 - 1.1 / height)).astype(np.float32)
    hashed = np.sin(np.floor(fu)*127.1 + np.floor(fv)*311.7 + seed*17.1) * 43758.5453
    lit = ((hashed % 1) >= .77).astype(np.float32)
    reflection = np.array([.055,.115,.17]) + v[:,:,None] * np.array([.185,.245,.24])
    reflection += np.array([.10,.065,.08]) * np.maximum(0,np.sin(u*8+seed))[:,:,None]**8
    pane = reflection*(1-lit[:,:,None]) + np.array([.78,.53,.27])*lit[:,:,None]
    mix = mask[:,:,None] * (.92 if style == 'glass' else .9)
    albedo = np.array(rgb)*(1-mix) + pane*mix
    emission = np.array([.42,.21,.055]) * (lit*mask*.5)[:,:,None]
    images = []
    for label, pixels in [('windows', albedo), ('lit rooms', emission)]:
        rgba = np.ones((resolution,resolution,4), dtype=np.float32)
        rgba[:,:,:3] = pixels
        image = bpy.data.images.new(name+' / '+label, width=resolution, height=resolution)
        image.colorspace_settings.name = 'Non-Color'
        image.pixels.foreach_set(rgba.ravel())
        image.pack()
        images.append(image)
    return images


def get_material(key, name):
    if key in materials:
        return materials[key]
    mat = bpy.data.materials.new(name+' / '+str(len(materials)))
    mat.diffuse_color = (*key[0],1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*key[0],1)
    bsdf.inputs['Roughness'].default_value = key[1]
    bsdf.inputs['Metallic'].default_value = key[2]
    bsdf.inputs['Emission Color'].default_value = (*key[3],1)
    bsdf.inputs['Emission Strength'].default_value = key[4]
    if key[5]:
        for image, socket in zip(facade_images(key,mat.name),['Base Color','Emission Color']):
            node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = image
            mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs[socket])
        bsdf.inputs['Emission Strength'].default_value = 1
    materials[key] = mat
    return mat


for batch in data['batches']:
    geometry = batch['geometry']
    positions = [Vector(geometry['positions'][i:i+3]) for i in range(0,len(geometry['positions']),3)]
    indices = geometry.get('indices') or list(range(len(positions)))
    faces = [indices[i:i+3] for i in range(0,len(indices),3)]
    normals,uv = geometry.get('normals'),geometry.get('uv')
    base = batch['material']
    for instance in batch['instances']:
        color = instance.get('color') or [1,1,1]
        rgb = tuple(round(color[i]*base['color'][i],4) for i in range(3))
        basic = (rgb,base.get('roughness',.7),base.get('metalness',0),tuple(base.get('emissive',[0,0,0])),base.get('emissiveIntensity',0))
        values = instance['matrix']
        matrix = convert @ Matrix(tuple(tuple(values[col*4+row] for col in range(4)) for row in range(4)))
        transformed = [tuple(matrix @ position) for position in positions]
        for face in faces:
            facade = None
            if base.get('facade') and normals and abs(normals[face[0]*3+1]) < .5:
                dimensions = instance['dimensions']
                width = dimensions[2] if abs(normals[face[0]*3]) > .5 else dimensions[0]
                facade = (base['facade'],round(width,3),round(dimensions[1],3),round(instance['facadeSeed'],4))
            key = (*basic,facade)
            get_material(key,batch['name'])
            target = groups[key]
            offset = len(target['vertices'])
            target['vertices'].extend(transformed[index] for index in face)
            target['faces'].append((offset,offset+1,offset+2))
            target['uv'].extend(tuple(uv[index*2:index*2+2]) if uv else (0,0) for index in face)

for index,(key,geometry) in enumerate(groups.items()):
    mesh = bpy.data.meshes.new(f'City surfaces {index:03d}')
    mesh.from_pydata(geometry['vertices'],[],geometry['faces'])
    mesh.materials.append(materials[key])
    if key[5]:
        layer = mesh.uv_layers.new(name='Browser facade UV')
        for loop in mesh.loops:
            layer.data[loop.index].uv = geometry['uv'][loop.vertex_index]
    obj = bpy.data.objects.new(mesh.name,mesh)
    bpy.context.collection.objects.link(obj)

scene = bpy.context.scene
scene['world_seed'] = data['seed']
scene['source'] = 'Actual infinite-city.js instance batches; browser-local procedural city'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
import _cycles
scene.cycles.use_denoising = bool(getattr(_cycles, 'with_openimagedenoise', False))
scene.render.resolution_x = args.resolution
scene.render.resolution_y = int(args.resolution * 2 / 3)
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.world.use_nodes = True
world_nodes = scene.world.node_tree.nodes
world_nodes.get('Background').inputs['Color'].default_value = (.35, .46, .68, 1)
world_nodes.get('Background').inputs['Strength'].default_value = .6
sun_data = bpy.data.lights.new('Sunset key', 'SUN')
sun_data.energy = 2.7
sun_data.color = (1.0, .77, .53)
sun_data.angle = math.radians(7)
sun = bpy.data.objects.new('Sunset key', sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(28), math.radians(-25), math.radians(-42))

camera_data = bpy.data.cameras.new('City overview')
camera = bpy.data.objects.new('City overview', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = Vector(data.get('camera', [250, 210, 270]))
camera.location = (camera.location.x, -camera.location.z, camera.location.y)
target_three = data.get('target', [35, 12, 30])
target = Vector((target_three[0], -target_three[2], target_three[1]))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = 36
camera_data.clip_end = 3000
scene.camera = camera
args.output.parent.mkdir(parents=True, exist_ok=True)
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(args.output.resolve())
if args.blend:
    args.blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()), compress=True)
bpy.ops.render.render(write_still=True)
print('CITY_PREVIEW_OK', len(data['batches']), len(groups), len(scene.objects))
