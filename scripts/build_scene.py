"""Build an original sunset coastal city scene in Blender 4.3+.
Run: blender -b --python scripts/build_scene.py -- --render
"""
import argparse
import math
import os
from pathlib import Path
import random
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from city import build_city
from vehicle import create_car


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--resolution', type=int, default=1600, help='Preview width; height is 62.5 percent of width')
    parser.add_argument('--samples', type=int, default=48)
    parser.add_argument('--output', type=Path, default=ROOT / 'scenes' / 'sunset_coast.blend')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def mat(name, color, metallic=0, roughness=.5, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def into(obj, coll):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def cube(name, loc, size, material, bevel=0, coll=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new('Soft edges', 'BEVEL'); mod.width=bevel; mod.segments=2
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    if coll: into(o, coll)
    return o


def line(name, pts, radius, material, coll):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'; data.resolution_u=2
    spline=data.splines.new('POLY'); spline.points.add(len(pts)-1)
    for p,co in zip(spline.points,pts): p.co=(*co,1)
    data.bevel_depth=radius; data.bevel_resolution=2
    ob=bpy.data.objects.new(name,data); coll.objects.link(ob); data.materials.append(material)
    return ob


def mesh(name, verts, faces, material, coll):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.materials.append(material)
    o=bpy.data.objects.new(name,data); coll.objects.link(o)
    return o


def aim(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def palm(x,y,height,seed,coll,mats):
    rng=random.Random(seed)
    lean=rng.uniform(-.7,.7)
    verts=[]; faces=[]; rings=11; n=9
    for j in range(rings):
        t=j/(rings-1); cx=x+lean*t*t; cy=y+.45*t*t; radius=.22*(1-.45*t)
        for k in range(n):
            a=math.tau*k/n; verts.append((cx+radius*math.cos(a),cy+radius*math.sin(a),height*t))
    for j in range(rings-1):
        for k in range(n): faces.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
    mesh('Palm / curved ringed trunk',verts,faces,mats[0],coll)
    for j in range(1,10):
        t=j/10; r=.23*(1-.45*t)
        pts=[(x+lean*t*t+r*math.cos(math.tau*k/12),y+.45*t*t+r*math.sin(math.tau*k/12),height*t) for k in range(13)]
        line('Palm / trunk rings',pts,.018,mats[1],coll)
    top=Vector((x+lean,y+.45,height))
    verts=[]; faces=[]
    for frond in range(10):
        a=math.tau*frond/10+rng.uniform(-.17,.17)
        direction=Vector((math.cos(a),math.sin(a),0)); side=Vector((-math.sin(a),math.cos(a),0))
        length=rng.uniform(2.4,3.7)
        def point(t): return top+direction*length*t+Vector((0,0,1.45*math.sin(math.pi*t*.95)-1.7*t*t))
        line('Palm / frond spine',[point(t/10) for t in range(11)],.025,mats[2],coll)
        for segment in range(9):
            t0=segment/9; t1=(segment+1)/9
            w0=.20*math.sin(math.pi*t0); w1=.20*math.sin(math.pi*t1)
            idx=len(verts)
            verts.extend([point(t0)-side*w0,point(t0)+side*w0,point(t1)+side*w1,point(t1)-side*w1])
            faces.append((idx,idx+1,idx+2,idx+3))
        for leaflet in range(1,14):
            t=leaflet/15; base=point(t); span=.67*math.sin(math.pi*t)**.7
            for sign in (-1,1):
                tip=base+side*span*sign-direction*.3+Vector((0,0,-.18))
                idx=len(verts); verts.extend([base-direction*.18,base+direction*.16,tip,tip+direction*.12]); faces.append((idx,idx+1,idx+3,idx+2))
    mesh('Palm / feathered crown',verts,faces,mats[2+(seed%2)],coll)


def coast(coll):
    sand=mat('Warm coral sand',(.64,.39,.24),roughness=.94)
    stone=mat('Promenade warm terrazzo',(.56,.47,.39),roughness=.8)
    asphalt=mat('Blue-black asphalt',(.035,.048,.065),roughness=.38)
    nodes=asphalt.node_tree.nodes; links=asphalt.node_tree.links
    noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=95
    bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.23; bump.inputs['Distance'].default_value=.06
    links.new(noise.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
    yellow=mat('Golden lane paint',(.92,.54,.07),roughness=.5)
    white=mat('Ivory markings',(.83,.79,.62),roughness=.7)
    curb=mat('Coral curb',(.5,.22,.21))
    cube('City foundation',(-274,1700,-.65),(560,4000,1.1),stone,coll=coll)
    cube('Ocean Drive / asphalt',(0,1700,-.075),(13,4000,.15),asphalt,coll=coll)
    cube('Beach',(21,1700,-.48),(20,4000,.6),sand,coll=coll)
    cube('Promenade',(9,1700,.02),(5,4000,.22),stone,.08,coll)
    cube('Art Deco sidewalk',(-8.1,1700,.01),(3.4,4000,.22),stone,.06,coll)
    for x in (-6.55,6.55):
        cube('Continuous curb',(x,1700,.13),(.25,4000,.26),curb,.05,coll)
    for x in (-.13,.13): cube('Double yellow center line',(x,1700,.012),(.09,4000,.015),yellow,coll=coll)
    for y in range(-78,100,7):
        for x in (-3.3,3.3): cube('Lane dash',(x,y,.016),(.1,2.5,.016),white,coll=coll)
    for y in (20,65):
        for x in range(-6,7): cube('Pedestrian crossing',(x,y,.02),(.65,2.6,.02),white,coll=coll)
    for y in range(-78,100,4):
        cube('Promenade expansion joint',(9,y,.137),(4.8,.025,.01),curb,coll=coll)
    water=mat('Atlantic / turquoise water',(.02,.29,.31),metallic=.55,roughness=.19)
    p=water.node_tree.nodes.get('Principled BSDF'); p.inputs['IOR'].default_value=1.333
    nodes=water.node_tree.nodes; links=water.node_tree.links
    tex=nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=1.5; tex.inputs['Detail'].default_value=3
    coords=nodes.new('ShaderNodeTexCoord'); mapping=nodes.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'; mapping.inputs[1].default_value=(.5,4,1)
    links.new(coords.outputs['Object'],mapping.inputs[0]); links.new(mapping.outputs[0],tex.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.35; bump.inputs['Distance'].default_value=.22
    links.new(tex.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs['Normal'],p.inputs['Normal'])
    cube('Atlantic Ocean',(2031,1700,-.43),(4000,4000,.12),water,coll=coll)
    foam=mat('Shoreline foam',(.73,.83,.76),roughness=.45)
    for strip in range(3):
        pts=[(31.3+strip*.8+.23*math.sin(y*.36+strip),y,-.34+strip*.012) for y in range(-100,145)]
        line('Surf / small rolling waves',pts,.035+.015*strip,foam,coll)
    leaf1=mat('Palm dark jade',(.035,.23,.105),roughness=.8)
    leaf2=mat('Palm sunlit green',(.10,.32,.12),roughness=.8)
    bark=mat('Palm trunk',(.29,.16,.1),roughness=.9)
    ring=mat('Palm trunk ridges',(.15,.085,.06),roughness=.9)
    trees=bpy.data.collections.new('02 · Royal palms'); bpy.context.scene.collection.children.link(trees)
    for i,y in enumerate(range(-30,270,12)):
        palm(9.6,y,7.2+(i%3)*.55,100+i,trees,(bark,ring,leaf1,leaf2))
        if i%2==0: palm(-8.3,y+5,8.4,200+i,trees,(bark,ring,leaf1,leaf2))
    distant=[mat('Distant district / rose',(.28,.17,.25)),mat('Distant district / blue',(.19,.25,.3)),mat('Distant district / mauve',(.31,.24,.32))]
    for index,y in enumerate(range(80,500,28)):
        height=8+(index*7)%17
        material=distant[index%3]
        cube('Distant coastal district',(-19,y,height/2),(17,21,height),material,.2,coll)
        cube('Distant stepped penthouse',(-22,y,height+1.7),(11,13,3.4),material,.15,coll)
        for z in range(3,height,3): cube('Distant horizontal cornice',(-10.3,y,z),(.3,21,.12),stone,coll=coll)
    # Beach umbrellas, loungers and a lifeguard tower, all editable meshes.
    coral=mat('Umbrella / coral',(.95,.15,.21))
    cream=mat('Umbrella / canvas',(.93,.75,.46))
    wood=mat('Weathered beach timber',(.39,.22,.13))
    mint=mat('Lifeguard turquoise',(.09,.49,.43))
    for index,y in enumerate((-25,-10,7,33,49,68)):
        x=21+(index%2)*3
        line('Umbrella pole',[(x,y,-.1),(x,y,2.3)],.045,wood,coll)
        for seg in range(12):
            a=math.tau*seg/12; b=math.tau*(seg+1)/12
            mesh('Beach umbrella canopy',[(x,y,2.65),(x+1.75*math.cos(a),y+1.75*math.sin(a),2.0),(x+1.75*math.cos(b),y+1.75*math.sin(b),2.0)],[(0,1,2)],coral if seg%2 else cream,coll)
        for dx in (-.8,.8):
            o=cube('Canvas sun lounger',(x+dx,y-1.1,.25),(.62,1.9,.12),cream,.05,coll); o.rotation_euler[0]=.12
            for dy in (-.7,.7): cube('Lounger legs',(x+dx,y-1.1+dy,.06),(.48,.08,.28),wood,coll=coll)
    for x in (18,21.4):
        for y in (17,20): cube('Lifeguard tower stilts',(x,y,1.1),(.16,.16,2.8),wood,coll=coll)
    cube('Lifeguard deck',(19.7,18.5,2.4),(4.7,4,.23),cream,.05,coll)
    cube('Lifeguard cabin',(19.7,19,3.45),(3.25,2.55,2),mint,.1,coll)
    glass=mat('Lifeguard blue glazing',(.035,.12,.19),metallic=.6,roughness=.15)
    cube('Lifeguard glazing',(19.7,17.7,3.65),(2.6,.04,.8),glass,coll=coll)
    cube('Lifeguard roof',(19.7,19,4.54),(4,3.5,.18),coral,.08,coll)
    for z in range(8): cube('Tower stair',(18.6,15.1+.28*z,.15+.29*z),(1.1,.36,.12),wood,.025,coll)
    # Promenade benches and lights.
    black=mat('Street furniture charcoal',(.025,.04,.052),metallic=.6)
    lamp=mat('Warm lamp glow',(1,.51,.19),emission=4)
    for y in range(-20,90,17):
        line('Promenade light standard',[(7.0,y,.2),(7.0,y,4.7),(6.3,y,5.0),(5.8,y,4.9)],.055,black,coll)
        cube('Promenade lamp',(5.8,y,4.83),(.5,.4,.1),lamp,.06,coll)
        for k in range(4): cube('Bench timber slat',(10.2,y+4,.55+k*.025),(.09,1.65,.065),wood,.02,coll).location.x+=k*.13
        for dy in (-.6,.6): cube('Bench support',(10.4,y+4+dy,.3),(.45,.07,.5),black,coll=coll)


def lighting(scene):
    world=bpy.data.worlds.new('Lavender sunset atmosphere'); world.use_nodes=True; scene.world=world
    nodes=world.node_tree.nodes; links=world.node_tree.links
    bg=nodes.get('Background'); bg.inputs['Strength'].default_value=.65
    tex=nodes.new('ShaderNodeTexCoord'); separate=nodes.new('ShaderNodeSeparateXYZ'); ramp=nodes.new('ShaderNodeValToRGB')
    invert=nodes.new('ShaderNodeVectorMath'); invert.operation='SCALE'; invert.inputs[3].default_value=-1
    links.new(tex.outputs['Normal'],invert.inputs[0]); links.new(invert.outputs[0],separate.inputs[0]); links.new(separate.outputs['Z'],ramp.inputs[0]); links.new(ramp.outputs[0],bg.inputs[0])
    cr=ramp.color_ramp; cr.elements.remove(cr.elements[1]); cr.elements[0].position=0; cr.elements[0].color=(.68,.27,.26,1)
    for pos,col in ((.18,(.45,.22,.38,1)),(.55,(.12,.13,.29,1)),(1,(.035,.05,.14,1))): cr.elements.new(pos).color=col
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=15,location=(35,220,33))
    disc=bpy.context.object; disc.name='Sunset / distant golden sun'
    disc.data.materials.append(mat('Sunset disc',(1,.35,.09),emission=2))
    disc.visible_shadow=False
    bpy.ops.object.light_add(type='SUN',location=(20,40,25)); sun=bpy.context.object; sun.name='Golden-hour sun'; sun.data.energy=2.4; sun.data.color=(1,.65,.41); sun.data.angle=.12; aim(sun,(-20,-20,0))
    bpy.ops.object.light_add(type='AREA',location=(7,-9,19)); area=bpy.context.object; area.name='Sky soft fill'; area.data.energy=3800; area.data.color=(.43,.67,1); area.data.shape='DISK'; area.data.size=25; aim(area,(0,4,0))
    bpy.ops.object.light_add(type='AREA',location=(-4,-8,6)); area=bpy.context.object; area.name='Neon coral car rim'; area.data.energy=950; area.data.color=(1,.13,.3); area.data.size=9; aim(area,(3,-7,0))


def make_camera(name,loc,target,lens):
    bpy.ops.object.camera_add(location=loc)
    cam=bpy.context.object; cam.name=name; cam.data.lens=lens; cam.data.clip_end=10000
    aim(cam,target)
    return cam


def animate(hero,scene):
    # The hero's short cruise and a matching camera move are editable keyframes.
    for frame,y in ((1,-5),(120,-13),(240,-28)):
        hero.location=(2,y,.015); hero.keyframe_insert(data_path='location',frame=frame)
        for wheel in hero.children:
            if 'wheel_radius' in wheel:
                wheel.rotation_euler.x=(-5-y)/wheel['wheel_radius']
                wheel.keyframe_insert(data_path='rotation_euler',frame=frame)
    camera=make_camera('01 · Ocean Drive / cinematic tracking',(42,-52,22),(1,20,6.0),30)
    for frame,loc,target in ((1,(42,-52,22),(1,20,6.0)),(120,(38,-56,19),(0,14,5.0)),(240,(34,-66,16),(-1,4,4.0))):
        camera.location=loc; aim(camera,target); camera.keyframe_insert(data_path='location',frame=frame); camera.keyframe_insert(data_path='rotation_euler',frame=frame)
    scene.camera=camera
    make_camera('02 · Hero car / close-up',(9,-17,4),(1,-5,1),46)
    make_camera('03 · Coast / aerial',(68,-64,57),(-3,23,2),43)
    scene.timeline_markers.new('SUNSET CRUISE · 10 seconds',frame=1)
    scene.timeline_markers.new('HALFWAY / neon boulevard',frame=120)
    scene.timeline_markers.new('END / coastward',frame=240)
    scene.frame_set(1)


def main():
    args=arguments(); random.seed(6)
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials,bpy.data.worlds,bpy.data.curves,bpy.data.meshes,bpy.data.cameras,bpy.data.lights):
        for block in list(datablocks):
            if block.users==0: datablocks.remove(block)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC'
    import _cycles
    scene.render.engine='CYCLES'; scene.cycles.samples=args.samples
    scene.cycles.use_denoising=bool(getattr(_cycles,'with_openimagedenoise',False))
    scene.cycles.max_bounces=6; scene.cycles.diffuse_bounces=3; scene.cycles.glossy_bounces=3
    scene.render.resolution_x=args.resolution; scene.render.resolution_y=int(args.resolution*.625); scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.fps=24; scene.frame_start=1; scene.frame_end=240
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.film_transparent=False
    environment=bpy.data.collections.new('01 · Coast & boulevard'); scene.collection.children.link(environment)
    coast(environment)
    buildings=bpy.data.collections.new('03 · Art Deco district'); scene.collection.children.link(buildings); build_city(collection=buildings)
    vehicles=bpy.data.collections.new('04 · Vehicles'); scene.collection.children.link(vehicles)
    hero=create_car(name='Comet / hero turquoise coupe',color=(.025,.65,.56),collection=vehicles)
    for name,color,loc,angle in [('Coral coupe',(.85,.08,.13),(-4.5,18,.015),math.pi),('Ivory coupe',(.8,.68,.48),(4.8,40,.015),0)]:
        car=create_car(name=name,color=color,collection=vehicles); car.location=loc; car.rotation_euler.z=angle
    lighting(scene); animate(hero,scene)
    scene.use_nodes=True
    nodes=scene.node_tree.nodes; nodes.clear(); links=scene.node_tree.links
    render=nodes.new('CompositorNodeRLayers'); glare=nodes.new('CompositorNodeGlare'); glare.glare_type='FOG_GLOW'; glare.quality='HIGH'; glare.threshold=1.8; glare.mix=-.93
    output=nodes.new('CompositorNodeComposite'); links.new(render.outputs['Image'],glare.inputs['Image']); links.new(glare.outputs['Image'],output.inputs['Image'])
    # Store provenance/instructions inside the portable project too.
    note=bpy.data.texts.new('START HERE · Sunset Coast')
    note.write('SUNSET COAST | Original GTA6-inspired Blender environment\n\nBlender 4.3+ / Cycles / 24 fps / frames 1–240\nOpen camera view (Numpad 0), render F12, play animation Space.\nThree cameras: cinematic tracking, hero close-up, coastal aerial.\nAll architecture, cars, foliage and beach props are procedural original assets.\nThis is an environment/animation prototype, not the commercial GTA VI game.\nRebuild: blender -b --python scripts/build_scene.py -- --render\n')
    scene['project']='Sunset Coast'; scene['seed']=6; scene['description']='Original GTA6-inspired coastal environment and animated cruise'
    # Make the .blend pleasant to open, with the camera view and material colors.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.color_type='MATERIAL'
    args.output.parent.mkdir(parents=True,exist_ok=True)
    preview=ROOT/'previews'/'sunset_coast.png'; preview.parent.mkdir(parents=True,exist_ok=True)
    scene.render.filepath='//'+os.path.relpath(preview,args.output.resolve().parent)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output),compress=True)
    print(f'BUILD_OK objects={len(scene.objects)} output={args.output}',flush=True)
    if args.render: bpy.ops.render.render(write_still=True)

if __name__=='__main__': main()
