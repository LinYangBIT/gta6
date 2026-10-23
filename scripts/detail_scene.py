"""Refine the original scene with manufactured car details and finished streets.

Run after build_scene.py:
  blender -b scenes/sunset_coast.blend --python-exit-code 1 --python scripts/detail_scene.py
Then export_web.py exports the same geometry into the playable web experience.
This pass is idempotent. It keeps the animated vehicle and wheel pivots intact.
"""
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from city import _box, _boxes, _cylinder, _text

scene = bpy.context.scene
scene.frame_set(1)
PREFIX = 'Refinement / '
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)
collection = bpy.data.collections.get('05 · Crafted details')
if collection is None:
    collection = bpy.data.collections.new('05 · Crafted details')
    scene.collection.children.link(collection)


def existing(fragment):
    return next(m for m in bpy.data.materials if fragment in m.name)


def material(name, color, metallic=0, roughness=.5, emission=0):
    name = 'Detail / ' + name
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
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

chrome = material('brushed champagne metal', (.53,.47,.34), .88,.24)
trim = material('graphite trim', (.018,.023,.028), .35,.28)
leather = material('cognac upholstery', (.25,.08,.035), .0,.65)
seam = material('body panel gaps', (.005,.015,.018), .05,.55)
white = existing('Ivory markings')
wood = existing('Weathered beach timber')
glass = existing('Architecture / midnight glazing')
cream = existing('Architecture / warm porcelain')
metal = existing('Architecture / anodised aluminum')
cyan = existing('Architecture / aqua neon')
pink = existing('Architecture / hot pink neon')
warm = existing('Architecture / warm room lights')
leaf = existing('Palm dark jade')


def finish(obj, name, parent=None):
    obj.name = PREFIX + name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def box(name, loc, size, mat, parent=None, bevel=.01):
    obj = _box(PREFIX + name, loc, size, mat, collection, bevel)
    if parent:
        obj.parent = parent
    return obj


def pipe(name, points, radius, mat, parent=None, smooth=False):
    data = bpy.data.curves.new(PREFIX + name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 2
    sp = data.splines.new('POLY')
    sp.points.add(len(points)-1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    obj = bpy.data.objects.new(PREFIX + name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    # Body export intentionally includes only direct mesh children.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    if parent:
        obj.parent = parent
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def cylinder(name, loc, radius, depth, mat, parent=None, axis='Z', segments=24):
    obj = _cylinder(PREFIX + name, loc, radius, depth, mat, collection, vertices=segments)
    if axis == 'X':
        obj.rotation_euler.y = math.pi/2
    elif axis == 'Y':
        obj.rotation_euler.x = math.pi/2
    if parent:
        obj.parent = parent
    for poly in obj.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return obj



def fender_shoulder(root, side, y, paint):
    # Closed, swept arch shoulders cover the wheel well, preserving a continuous
    # car-body silhouette instead of leaving the exposed tire rim of a buggy.
    import bmesh
    vertices=[]; faces=[]; segments=32
    for i in range(segments+1):
        a=math.pi*i/segments
        for x,r in ((1.068,.486),(1.068,.54),(.68,.455),(.68,.405)):
            vertices.append((side*x,y+r*math.cos(a),.43+r*math.sin(a)))
    faces.append((3,2,1,0))
    for i in range(segments):
        for j in range(4):faces.append((4*i+j,4*i+(j+1)%4,4*(i+1)+(j+1)%4,4*(i+1)+j))
    faces.append(tuple(4*segments+i for i in range(4)))
    data=bpy.data.meshes.new(PREFIX+'formed fender shoulder')
    data.from_pydata(vertices,[],faces);data.materials.append(paint);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(PREFIX+root.name+' / formed fender shoulder',data)
    collection.objects.link(obj);obj.parent=root
    for polygon in data.polygons:polygon.use_smooth=True
    bevel=obj.modifiers.new('Pressed fender edge radius','BEVEL');bevel.width=.009;bevel.segments=3
    normal=obj.modifiers.new('Fender weighted normals','WEIGHTED_NORMAL');normal.keep_sharp=True
    return obj


def car_refinement(root):
    paint = next(m for m in bpy.data.materials if m.name.startswith(root.name + ' / satin metallic'))
    alloy = next(m for m in bpy.data.materials if m.name.startswith(root.name + ' / machined alloy'))
    led = next(m for m in bpy.data.materials if m.name.startswith(root.name + ' / LED white'))
    red = next(m for m in bpy.data.materials if m.name.startswith(root.name + ' / tail LED'))
    body = next(o for o in root.children if o.name.endswith('/ sculpted monocoque'))
    # Refine the single body shell into smooth longitudinal sections. The body
    # stays editable and is still the original car rather than a downloaded mesh.
    if True:  # Rebuild deterministically; rerunning never stacks boolean operations.
        stations = [(-2.26,.82,.38,.62),(-2.10,.90,.37,.68),(-1.85,.98,.37,.75),
                    (-1.55,1.015,.36,.83),(-1.24,1.00,.35,.87),(-.80,.98,.34,.83),
                    (-.25,.975,.34,.83),(.30,.98,.34,.84),(.74,1.00,.35,.86),
                    (1.13,1.035,.36,.90),(1.48,1.045,.38,.94),
                    (1.80,1.015,.40,.90),(2.10,.96,.42,.84),(2.20,.94,.43,.82)]
        profile = [(-.92,0),(.92,0),(1,.23),(1,.64),(.94,.91),(.78,1),(.48,.95),
                   (0,.93),(-.48,.95),(-.78,1),(-.94,.91),(-1,.64),(-1,.23)]
        vertices = [(u*w,y,low+t*(high-low)) for y,w,low,high in stations for u,t in profile]
        n=len(profile)
        faces=[tuple(reversed(range(n)))]
        for j in range(len(stations)-1):
            for i in range(n):
                faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
        faces.append(tuple((len(stations)-1)*n+i for i in range(n)))
        data=bpy.data.meshes.new(PREFIX+'sculpted body surface')
        data.from_pydata(vertices,[],[tuple(reversed(f)) for f in faces]);data.materials.append(paint);data.update()
        body.data=data
        for m in list(body.modifiers):body.modifiers.remove(m)
        # Apply real wheel-well cutouts before the final edge radius.
        bpy.context.view_layer.update()
        for side in (-1,1):
            for y in (-1.43,1.42):
                cutter=cylinder('temporary arch cutter',(side*1.03,y,.43),.482,.64,trim,root,'X',48)
                bpy.context.view_layer.update()
                mod=body.modifiers.new('Manufactured wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
                bpy.context.view_layer.objects.active=body
                bpy.ops.object.modifier_apply(modifier=mod.name)
                bpy.data.objects.remove(cutter,do_unlink=True)
        for polygon in body.data.polygons: polygon.use_smooth = False
        bevel=body.modifiers.new('Rounded body edges','BEVEL');bevel.width=.025;bevel.segments=4
        normals=body.modifiers.new('Weighted body normals','WEIGHTED_NORMAL');normals.keep_sharp=True
        body['refined_shell']=True
    # Raised wheel arch edges have swept arcs, rather than rectangular fenders.
    for side in (-1,1):
        for y in (-1.43,1.42):
            points=[(side*1.026,y+.485*math.cos(a),.43+.485*math.sin(a)) for a in [math.pi*i/32 for i in range(33)]]
            fender_shoulder(root, side, y, paint)
            pipe(root.name+' / fender rim',points,.023,paint,root)
        # Narrow real panel gaps and satin trim keep the shell readable nearby.
        pipe(root.name+' / door seam',[(side*.982,-.70,.79),(side*.991,-.66,.52),(side*.986,-.53,.415),
                                      (side*.994,.58,.415),(side*1.014,.70,.55),(side*.99,.72,.81)],.007,seam,root)
        pipe(root.name+' / shoulder highlight',[(side*.96,-.82,.75),(side*.99,-.2,.75),(side*.997,.47,.76),(side*1.025,.84,.80)],.012,paint,root)
        # All glass edges now have fine manufactured weatherstrips and A pillars.
        pipe(root.name+' / side glazing seal',[(side*.78,-.70,.847),(side*.60,-.23,1.295),
                                             (side*.58,.64,1.315),(side*.76,1.10,.887),(side*.78,-.70,.847)],.015,trim,root)
        pipe(root.name+' / painted A pillar',[(side*.78,-.78,.83),(side*.60,-.26,1.315)],.025,paint,root)
        pipe(root.name+' / roof rail',[(side*.60,-.26,1.325),(side*.59,.1,1.34),(side*.57,.68,1.345)],.018,chrome,root)
        # Recessed intake grilles and integrated lamp lenses.
        for j in range(6):
            box(root.name+' / front grille blade',(side*.62+(j-2.5)*.063,-2.305,.465),(.014,.016,.115),trim,root,.003)
        for j in range(3):
            box(root.name+' / rear lamp pixel',(side*(.37+j*.2),2.248,.714),(.12,.015,.018),red,root,.003)
    # Subtle hood ridges, wipers, badge and actual cockpit components.
    for side in (-1,1):
        pipe(root.name+' / hood crease',[(side*.28,-2.02,.701),(side*.37,-1.7,.777),(side*.39,-1.12,.819),(side*.38,-.85,.823)],.009,paint,root)
        pipe(root.name+' / wiper blade',[(side*.43,-.775,.86),(side*.30,-.70,.924),(side*.1,-.68,.935)],.008,trim,root)
        seat=box(root.name+' / leather seat base',(side*.35,.23,.60),(.48,.56,.15),leather,root,.05)
        seat=box(root.name+' / sculpted seat back',(side*.35,.49,.82),(.48,.14,.61),leather,root,.06);seat.rotation_euler.x=-.12
        box(root.name+' / headrest',(side*.35,.53,1.12),(.27,.14,.16),leather,root,.04)
    box(root.name+' / instrument binnacle',(-.30,-.40,.88),(.52,.25,.13),trim,root,.035)
    box(root.name+' / dashboard',(0,-.50,.79),(1.24,.32,.13),trim,root,.045)
    # Steering ring is visible from a close orbit through the side glass.
    pts=[(-.33+.14*math.cos(a),-.31,.95+.14*math.sin(a)) for a in [math.tau*i/40 for i in range(41)]]
    pipe(root.name+' / leather steering wheel',pts,.014,trim,root)
    box(root.name+' / steering hub',(-.33,-.31,.95),(.09,.035,.06),chrome,root,.02)
    for offset in (-.23,0,.23):
        box(root.name+' / deck cooling louvre',(0,1.44+offset,.935),(1.02,.055,.018),trim,root,.008)
    box(root.name+' / center brake lamp',(0,.99,1.01),(.4,.018,.018),red,root,.004)
    # Named mesh badge, unlike a texture, is portable in both Blender and glTF.
    text=bpy.data.curves.new(PREFIX+'rear lettering','FONT');text.body='COASTAL  /  GT';text.align_x='CENTER';text.size=.062;text.extrude=.0015;text.materials.append(chrome)
    obj=bpy.data.objects.new(PREFIX+root.name+' / rear lettering',text);collection.objects.link(obj)
    obj.location=(0,2.249,.636);obj.rotation_euler=(math.pi/2,0,math.pi)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj=bpy.context.object;obj.parent=root
    # Wheel detail stays under the existing animated wheel pivots.
    for wheel in (o for o in root.children if 'wheel_radius' in o):
        side=-1 if wheel.location.x<0 else 1
        for i in range(5):
            a=i*math.tau/5
            cylinder(root.name+' / titanium wheel stud',(side*.129,math.sin(a)*.043,math.cos(a)*.043),.009,.012,chrome,wheel,'X',12)
        for i in range(18):
            a=i*math.tau/18
            cylinder(root.name+' / drilled rotor recess',(side*.074,math.sin(a)*.215,math.cos(a)*.215),.009,.003,trim,wheel,'X',8)
        # Sipes across the visible sidewall, batched at export by material.
        for i in range(32):
            a=i*math.tau/32
            pipe(root.name+' / tire shoulder sipe',[(side*.03,math.sin(a)*.414,math.cos(a)*.414),
                (side*.068,math.sin(a+.025)*.393,math.cos(a+.025)*.393)],.004,seam,wheel)
    # Sharper metallic reflections distinguish glass, paint and rubber.
    p=paint.node_tree.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value=.30;p.inputs['Coat Weight'].default_value=.45
    p.inputs['Coat Roughness'].default_value=.14


hero=bpy.data.objects['Comet / hero turquoise coupe']
car_refinement(hero)

# Finish the route-facing distant district instead of leaving the playable
# boulevard lined with blank cuboids beyond the initial hotel block.
rng=random.Random(2026)
fronts=[]
for obj in sorted(scene.objects,key=lambda o:o.location.y):
    if obj.name.startswith('Distant coastal district') and obj.location.y<=305:
        fronts.append(obj)
for idx,obj in enumerate(fronts):
    x=obj.location.x+obj.dimensions.x/2+.035
    y=obj.location.y
    height=obj.dimensions.z
    windows=[];lit=[];mullions=[]
    for z in range(4,int(height),3):
        for bay in range(7):
            wy=y-8.7+bay*2.9
            entry=((x+.025,wy,z+1),(.07,2.15,1.7))
            (lit if rng.random()<.24 else windows).append(entry)
            mullions.append(((x+.08,wy,z+1),(.10,.06,1.78)))
    _boxes(PREFIX+'District / blue reflective glazing',windows,glass,collection)
    _boxes(PREFIX+'District / occupied rooms',lit,warm,collection)
    _boxes(PREFIX+'District / window frames',mullions,metal,collection)
    # Ground-floor shops form distinct destinations along the drive.
    for bay in (-1,0,1):
        wy=y+bay*5.5
        box('District / shop glazing',(x+.08,wy,1.55),(.10,4.9,2.7),glass,bevel=.02)
        for side in (-1,1):box('District / shop column',(x+.2,wy+side*2.48,1.6),(.27,.16,3),cream,bevel=.03)
        box('District / awning',(x+.65,wy,3.1),(1.4,5.05,.15),cream,bevel=.04)
        box('District / storefront light strip',(x+1.36,wy,3.05),(.04,4.95,.04),cyan if idx%2 else pink,bevel=.005)
    labels=['MARINA SOCIAL','PALM RECORDS','SOL HOTEL','COASTLINE GALLERY','NEON DINER','SURF SUPPLY','AQUA RESIDENCE','BAYVIEW LOUNGE','SUNSET STUDIO']
    box('District / marquee',(x+.16,y,height-1),(.18,17,1.55),trim,bevel=.05)
    _text(PREFIX+'District / raised sign',labels[idx%len(labels)],(x+.27,y,height-.95),.74,cyan if idx%2 else pink,collection,1.15)
    # Architectural parapets and rooftop plant screens.
    for offset in (-9.5,9.5):box('District / parapet',(obj.location.x,y+offset,height+.3),(17,.18,.65),cream,bevel=.04)
    box('District / front coping',(x-.18,y,height+.52),(.45,20,.16),cream,bevel=.04)
    for offset in (-5,5):
        box('District / roof machinery',(obj.location.x-2,y+offset,height+.7),(2.1,1.5,1.35),metal,bevel=.08)
        for vent in range(5):box('District / machinery grille',(obj.location.x-.94,y+offset+(vent-2)*.23,height+.72),(.025,.09,.85),trim,bevel=0)

# Tactile sidewalk and curb detail continues for the complete near circuit.
curb=existing('Coral curb')
for y in range(-45,285,4):
    if y>99:
        box('Promenade / paving joint',(9,y,.137),(4.8,.025,.01),curb,bevel=0)
    box('Sidewalk / paving joint',(-8.18,y,.128),(3.15,.022,.009),curb,bevel=0)
for y in range(102,285,7):
    for x in (-3.3,3.3):box('Road / continuing lane dash',(x,y,.017),(.10,2.5,.016),white,bevel=0)
for y in (0,56,112,168,224):
    # Street-facing benches, planting bowls and drains live outside lanes.
    for z in (.56,.77,.98):box('Sidewalk / bench timber',(-8.85,y,z),(.14,1.65,.085),wood,bevel=.02)
    for d in (-.62,.62):box('Sidewalk / bench frame',(-8.85,y+d,.5),(.36,.07,.8),metal,bevel=.02)
    cylinder('Sidewalk / planter bowl',(-8.3,y+4,.45),.47,.65,cream,segments=24)
    for i in range(9):
        a=math.tau*i/9
        pipe('Sidewalk / planter foliage',[(-8.3,y+4,.77),(-8.3+.25*math.cos(a),y+4+.25*math.sin(a),1.25),(-8.3+.48*math.cos(a),y+4+.48*math.sin(a),1.08)],.045,leaf)
    box('Road / drain frame',(6.2,y,.022),(.35,.64,.025),metal,bevel=.01)
    for slat in range(6):box('Road / drain slots',(6.2,y+(slat-2.5)*.09,.037),(.28,.025,.009),trim,bevel=0)

# Café glassware and signage make close street views more convincing.
for y in (-1.5,4,9.5):
    for side in (-1,1):
        cylinder('Cafe / ceramic cup',(-8.95,y+side*.24,1.235),.055,.12,cream,segments=16)
        cylinder('Cafe / saucer',(-8.95,y+side*.24,1.18),.09,.012,chrome,segments=20)
    cylinder('Cafe / table vase',(-8.95,y,1.28),.07,.23,cyan,segments=16)
scene['detail_revision']=2
scene['detail_note']='Refined wheel wells, trim, rotor machining, cockpit, route shopfronts and sidewalk furnishings.'
bpy.context.view_layer.update()
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scenes'/'sunset_coast.blend'),compress=True)
print('DETAIL_OK',len(scene.objects),flush=True)
