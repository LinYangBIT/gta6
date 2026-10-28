"""Render an editable Blender snapshot exported from the real browser city.

node scripts/export_infinite_preview.mjs --output /tmp/endless-city.json
blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- \
  --input /tmp/endless-city.json --output previews/endless_city.png

# Street-life snapshot, using actual browser geometry and original car GLB:
# node scripts/export_infinite_preview.mjs --street --output /tmp/street-life.json
# blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- \
#   --input /tmp/street-life.json --output previews/street_life.png \
#   --blend scenes/street_life.blend --resolution 1200

# Coastal reconstruction, plus an overview from the same Blender scene:
# node scripts/export_infinite_preview.mjs --coastal --output /tmp/coastal-district.json
# blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- \
#   --input /tmp/coastal-district.json --output previews/coastal_district.png \
#   --overview-output previews/coast_network.png --blend scenes/coastal_district.blend
# Dense city, with a bounded 81-cell near/far snapshot:
# node scripts/export_infinite_preview.mjs --dense --seed 610 --output /tmp/dense-city.json
# blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- \
#   --input /tmp/dense-city.json --output previews/dense_city.png \
#   --overview-output previews/dense_city_aerial.png --blend scenes/dense_city.blend \
#   --resolution 1280 --samples 32
# Cyberpunk blue-hour profile, including runtime hero-car neon overlays:
# node scripts/export_infinite_preview.mjs --cyberpunk --seed 610 --output /tmp/cyberpunk-city.json
# blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- \
#   --input /tmp/cyberpunk-city.json --output previews/cyberpunk_city.png \
#   --overview-output previews/cyberpunk_city_aerial.png --blend scenes/cyberpunk_city.blend \
#   --resolution 1920 --samples 48

The live city is infinite; this preview contains only its bounded nearby cells.
Facade window masks are baked offline from the browser shader; GPU precision,
lighting and postprocessing can differ. This is not a browser screenshot.
"""
import argparse
import base64
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
parser.add_argument('--overview-output', type=Path)
parser.add_argument('--samples', type=int, default=24)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
data = json.loads(args.input.read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Convert Three.js Y-up world positions into Blender Z-up coordinates.
convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
groups = defaultdict(lambda: {'vertices': [], 'faces': [], 'uv': [], 'colors': [], 'normals': []})
materials = {}
sign_atlases = {}
for batch in data['batches']:
    atlas = batch['material'].get('signAtlas')
    if atlas:
        import numpy as np
        sign_atlas = bpy.data.images.new(batch['name']+' / sign atlas', width=atlas['width'], height=atlas['height'])
        sign_atlas.colorspace_settings.name = 'sRGB'
        sign_atlas.pixels.foreach_set(np.frombuffer(base64.b64decode(atlas['data']),dtype=np.uint8).astype(np.float32)/255)
        sign_atlas.pack()
        sign_atlases[batch['name']] = sign_atlas


def facade_images(key, name):
    """Bake the browser shader's UV window mask for this offline preview only."""
    import numpy as np
    rgb, _, _, _, _, facade = key[:6]
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
    lit = ((hashed % 1) >= (.58 if data.get('cyberpunk') else .77)).astype(np.float32)
    if data.get('cyberpunk'):
        room_hue = (np.sin((np.floor(fu)+19)*127.1 + (np.floor(fv)+41)*311.7 + seed*17.1) * 43758.5453) % 1
        room_color = np.where((room_hue >= .56)[:,:,None], np.array([1,.45,.12]), np.array([.09,.70,.94]))
        room_color = np.where((room_hue >= .90)[:,:,None], np.array([.72,.13,.65]), room_color)
        reflection = np.array([.025,.075,.14]) + v[:,:,None] * np.array([.155,.205,.31])
        reflection += np.array([.16,.025,.12]) * np.maximum(0,np.sin(u*8+seed))[:,:,None]**8
        pane = reflection*(1-lit[:,:,None]) + room_color*.72*lit[:,:,None]
        emission = room_color * (lit*mask*.72)[:,:,None]
    else:
        reflection = np.array([.055,.115,.17]) + v[:,:,None] * np.array([.185,.245,.24])
        reflection += np.array([.10,.065,.08]) * np.maximum(0,np.sin(u*8+seed))[:,:,None]**8
        pane = reflection*(1-lit[:,:,None]) + np.array([.78,.53,.27])*lit[:,:,None]
        emission = np.array([.42,.21,.055]) * (lit*mask*.5)[:,:,None]
    mix = mask[:,:,None] * (.92 if style == 'glass' else .9)
    albedo = np.array(rgb)*(1-mix) + pane*mix
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
    if key[7]:
        attribute=mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name='Browser vertex color'
        mat.node_tree.links.new(attribute.outputs['Color'],bsdf.inputs['Base Color'])
        if key[11]:
            mat.node_tree.links.new(attribute.outputs['Color'],bsdf.inputs['Emission Color'])
    if key[8] in sign_atlases:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=sign_atlases[key[8]]
        mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
        if key[12]:
            mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Emission Color'])
    if key[6]:
        noise=mat.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=34
        coordinate=mat.node_tree.nodes.new('ShaderNodeNewGeometry')
        mat.node_tree.links.new(coordinate.outputs['Position'],noise.inputs['Vector'])
        ramp=mat.node_tree.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color=(*[channel*.88 for channel in key[0]],1)
        ramp.color_ramp.elements[1].color=(*[channel*1.08 for channel in key[0]],1)
        mat.node_tree.links.new(noise.outputs['Fac'],ramp.inputs[0])
        mat.node_tree.links.new(ramp.outputs[0],bsdf.inputs['Base Color'])
        if key[6]=='paving':
            tiles=mat.node_tree.nodes.new('ShaderNodeTexBrick');tiles.offset=0
            tiles.inputs['Scale'].default_value=1/1.8;tiles.inputs['Brick Width'].default_value=1;tiles.inputs['Row Height'].default_value=1
            tiles.inputs['Mortar Size'].default_value=.009
            tiles.inputs['Color1'].default_value=(*[channel*.96 for channel in key[0]],1)
            tiles.inputs['Color2'].default_value=(*[channel*1.04 for channel in key[0]],1)
            tiles.inputs['Mortar'].default_value=(*[channel*.70 for channel in key[0]],1)
            mat.node_tree.links.new(coordinate.outputs['Position'],tiles.inputs['Vector'])
            mat.node_tree.links.new(tiles.outputs['Color'],bsdf.inputs['Base Color'])
    if key[10]:
        coordinate=mat.node_tree.nodes.new('ShaderNodeNewGeometry')
        noise=mat.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=.6;noise.inputs['Detail'].default_value=3
        mat.node_tree.links.new(coordinate.outputs['Position'],noise.inputs['Vector'])
        bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.14
        mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
        bsdf.inputs['Roughness'].default_value=.20
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
        # MeshBasicMaterial uses each instance's color for its full unlit output.
        # Retain colored neon lettering instead of turning every pooled sign white.
        emission = rgb if base.get('basicMaterial') else tuple(base.get('emissive',[0,0,0]))
        basic = (rgb,base.get('roughness',.7),base.get('metalness',0),emission,base.get('emissiveIntensity',0))
        values = instance['matrix']
        matrix = convert @ Matrix(tuple(tuple(values[col*4+row] for col in range(4)) for row in range(4)))
        transformed = [tuple(matrix @ position) for position in positions]
        normal_matrix=matrix.to_3x3().inverted().transposed()
        for face in faces:
            facade = None
            if base.get('facade') and normals and abs(normals[face[0]*3+1]) < .5:
                dimensions = instance['dimensions']
                width = dimensions[2] if abs(normals[face[0]*3]) > .5 else dimensions[0]
                facade = (base['facade'],round(width,3),round(dimensions[1],3),round(instance['facadeSeed'],4))
            key = (*basic,facade,'road' if base.get('road') else 'paving' if base.get('paving') else None, bool(base.get('vertexColors')), batch['name'] if base.get('signAtlas') else None, bool(base.get('smooth')) or not batch['name'].startswith('City /'),bool(base.get('water')),bool(base.get('basicMaterial')),bool(base.get('emissiveMap')))
            get_material(key,batch['name'])
            target = groups[key]
            offset = len(target['vertices'])
            target['vertices'].extend(transformed[index] for index in face)
            target['faces'].append((offset,offset+1,offset+2))
            for index in face:
                texcoord=tuple(uv[index*2:index*2+2]) if uv else (0,0)
                if base.get('signAtlas'):
                    slot=instance.get('signIndex',0);cols=base['signAtlas'].get('columns',4);rows=base['signAtlas'].get('rows',2);texcoord=((texcoord[0]+slot%cols)/cols,(texcoord[1]+math.floor(slot/cols))/rows)
                target['uv'].append(texcoord)
                target['normals'].append(tuple((normal_matrix @ Vector(normals[index*3:index*3+3])).normalized()) if normals else (0,0,1))
                colors=geometry.get('colors')
                target['colors'].append(tuple(colors[index*3+j]*rgb[j] for j in range(3))+(1,) if colors else (*rgb,1))

for index,(key,geometry) in enumerate(groups.items()):
    mesh = bpy.data.meshes.new(f'City surfaces {index:03d}')
    mesh.from_pydata(geometry['vertices'],[],geometry['faces'])
    mesh.materials.append(materials[key])
    if key[5] or key[8]:
        layer = mesh.uv_layers.new(name='Browser facade UV')
        for loop in mesh.loops:
            layer.data[loop.index].uv = geometry['uv'][loop.vertex_index]
    if key[7]:
        layer=mesh.color_attributes.new(name='Browser vertex color',type='FLOAT_COLOR',domain='CORNER')
        for loop in mesh.loops:layer.data[loop.index].color=geometry['colors'][loop.vertex_index]
    if key[9]:
        for polygon in mesh.polygons:polygon.use_smooth=True
        mesh.normals_split_custom_set_from_vertices(geometry['normals'])
    obj = bpy.data.objects.new(mesh.name,mesh)
    bpy.context.collection.objects.link(obj)

hero=data.get('hero')
if hero:
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=hero['glb'])
    imported=list(bpy.context.selected_objects)
    carrier=bpy.data.objects.new('Blender coupe / exact browser asset',None)
    bpy.context.collection.objects.link(carrier)
    carrier.location=(hero['x'],-hero['z'],.015)
    carrier.rotation_euler.z=hero['yaw']
    for obj in imported:
        if obj.parent is None:obj.parent=carrier

scene = bpy.context.scene
scene['world_seed'] = data['seed']
scene['source'] = 'Actual infinite-city.js and actors.js geometry; original car.glb; offline Blender lighting' if data.get('street') else 'Actual infinite-city.js instance batches; browser-local procedural city'
scene['finite_snapshot'] = True
scene['streamed_chunk_count'] = data['stats']['loaded']
if data.get('coastal'):
    scene['source'] = 'Actual coast-layout/coast-render/coast-architecture + infinite-city/actors/gameplay geometry; original car.glb; offline Blender lighting'
    scene['reference_direction'] = 'Manually authored from viewed public Vice City Ocean Drive / GTA VI Dominion and Dixon screenshots. No extracted game geometry or textures.'
if data.get('dense'):
    scene['source'] = 'Actual coast-layout/urban-architecture/world-layout/infinite-city/city-horizon/actors browser geometry; finite streamed neighborhood; offline Blender lighting'
    scene['distant_chunk_count'] = data['stats'].get('farLoaded',0)
    scene['visible_building_count'] = data['stats'].get('totalBuildings',data['stats']['buildings'])
if data.get('cyberpunk'):
    scene['visual_profile'] = 'Cyberpunk blue hour / actual runtime geometry and hero neon overlays'
scene['preview_limits'] = 'Finite snapshot of the live infinite world. Offline materials, lighting and tone mapping differ from the browser. This is not a gameplay screenshot.'
scene.render.engine = 'CYCLES'
scene.cycles.samples = args.samples if data.get('street') else min(args.samples,16)
import _cycles
scene.cycles.use_denoising = bool(getattr(_cycles, 'with_openimagedenoise', False))
scene.render.resolution_x = args.resolution
scene.render.resolution_y = int(args.resolution / data.get('aspect',1.5))
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
if data.get('vivid'):
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .10
if data.get('cyberpunk'):
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .35
scene.world.use_nodes = True
world_nodes = scene.world.node_tree.nodes
world_nodes.get('Background').inputs['Color'].default_value = (.45, .65, .82, 1) if data.get('street') else (.35,.46,.68,1)
world_nodes.get('Background').inputs['Strength'].default_value = .6
if data.get('street'):
    sky=world_nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_disc=False
    sky.sun_elevation=math.radians(28);sky.sun_rotation=math.radians(135)
    scene.world.node_tree.links.new(sky.outputs['Color'],world_nodes.get('Background').inputs['Color'])
    world_nodes.get('Background').inputs['Strength'].default_value=.20 if data.get('vivid') else .18
    if data.get('cyberpunk'):
        sky.sun_elevation=math.radians(8)
        world_nodes.get('Background').inputs['Strength'].default_value=.13
    # Keep the same clear cyan-to-warm-horizon art direction as the browser sky;
    # Nishita still supplies ambient illumination to physical surfaces.
    import numpy as np
    rgba=np.ones((256,512,4),dtype=np.float32)
    bottom=np.array([.51,.78,.95] if data.get('vivid') else [.55,.73,.91]);top=np.array([.025,.31,.67] if data.get('vivid') else [.035,.25,.56])
    if data.get('cyberpunk'):
        bottom=np.array([.135,.073,.163]);top=np.array([.008,.024,.093])
    for row in range(256):
        elevation=max(0,math.sin((row/255-.5)*math.pi));t=min(1,elevation/.22);t=t*t*(3-2*t)
        rgba[row,:,:3]=bottom*(1-t)+top*t
    backdrop=bpy.data.images.new('Browser sky gradient / preview',width=512,height=256)
    backdrop.colorspace_settings.name='Non-Color';backdrop.pixels.foreach_set(rgba.ravel());backdrop.pack()
    environment=world_nodes.new('ShaderNodeTexEnvironment');environment.image=backdrop
    camera_background=world_nodes.new('ShaderNodeBackground');camera_background.inputs['Strength'].default_value=.9
    scene.world.node_tree.links.new(environment.outputs['Color'],camera_background.inputs['Color'])
    path=world_nodes.new('ShaderNodeLightPath');mix=world_nodes.new('ShaderNodeMixShader')
    scene.world.node_tree.links.new(path.outputs['Is Camera Ray'],mix.inputs[0])
    scene.world.node_tree.links.new(world_nodes.get('Background').outputs['Background'],mix.inputs[1])
    scene.world.node_tree.links.new(camera_background.outputs['Background'],mix.inputs[2])
    scene.world.node_tree.links.new(mix.outputs[0],world_nodes.get('World Output').inputs['Surface'])
sun_data = bpy.data.lights.new('Sunset key', 'SUN')
sun_data.energy = 3.3 if data.get('vivid') else 3.0 if data.get('street') else 2.7
sun_data.color = (1.0,.91,.80) if data.get('vivid') else (1.0,.88,.73) if data.get('street') else (1.0,.77,.53)
if data.get('cyberpunk'):
    sun_data.energy = 2.05
    sun_data.color = (.64,.73,1.0)
sun_data.angle = math.radians(2 if data.get('street') else 7)
sun = bpy.data.objects.new('Sunset key', sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(28), math.radians(-25), math.radians(-42))
if data.get('cyberpunk'):
    fill_data=bpy.data.lights.new('Cyan dusk fill','SUN');fill_data.energy=.72;fill_data.color=(.22,.77,.86);fill_data.angle=math.radians(12)
    fill=bpy.data.objects.new('Cyan dusk fill',fill_data);bpy.context.collection.objects.link(fill)
    fill.rotation_euler=(math.radians(48),math.radians(15),math.radians(126))
    # A restrained optical glow is an offline approximation, not browser post-FX.
    scene.use_nodes=True
    nodes=scene.node_tree.nodes;nodes.clear()
    layers=nodes.new('CompositorNodeRLayers');glow=nodes.new('CompositorNodeGlare');glow.glare_type='FOG_GLOW';glow.quality='HIGH';glow.threshold=.85;glow.size=7
    composite=nodes.new('CompositorNodeComposite')
    scene.node_tree.links.new(layers.outputs['Image'],glow.inputs['Image']);scene.node_tree.links.new(glow.outputs['Image'],composite.inputs['Image'])

camera_data = bpy.data.cameras.new('Street life / landscape camera' if data.get('street') else 'City overview')
camera = bpy.data.objects.new('City overview', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = Vector(data.get('camera', [250, 210, 270]))
camera.location = (camera.location.x, -camera.location.z, camera.location.y)
target_three = data.get('target', [35, 12, 30])
target = Vector((target_three[0], -target_three[2], target_three[1]))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = data.get('lens',36)
camera_data.clip_end = 3000
scene.camera = camera
overview=None
if args.overview_output:
    overview_data=bpy.data.cameras.new('Coastal district / aerial camera');overview_data.lens=data.get('overviewLens',38);overview_data.clip_end=3000
    overview=bpy.data.objects.new('Coastal district / aerial camera',overview_data);bpy.context.collection.objects.link(overview)
    ox,oy,oz=data.get('overviewCamera',[330,340,330]);overview.location=(ox,-oz,oy)
    tx,ty,tz=data.get('overviewTarget',[-15,0,-150]);overview_target=Vector((tx,-tz,ty))
    overview.rotation_euler=(overview_target-overview.location).to_track_quat('-Z','Y').to_euler()
args.output.parent.mkdir(parents=True, exist_ok=True)
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(args.output.resolve())
if args.blend:
    args.blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()), compress=True)
bpy.ops.render.render(write_still=True)
if overview:
    scene.camera=overview;args.overview_output.parent.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(args.overview_output.resolve());bpy.ops.render.render(write_still=True)
    scene.camera=camera
print('CITY_PREVIEW_OK', len(data['batches']), len(groups), len(scene.objects))
