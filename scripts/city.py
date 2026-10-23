"""Procedural, original coastal Art Deco neighborhood for Blender 4.3+.

The avenue runs along Y. Facades look east (+X), toward the waterfront.
No external textures, models, fonts, or add-ons are needed.
"""

import bpy
import math
import random


def _material(name, color, metallic=0.0, roughness=0.5, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


def _link(obj, collection):
    collection.objects.link(obj)
    return obj


def _box(name, center, size, material, collection, bevel=0):
    x, y, z = (s / 2 for s in size)
    vertices = [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
                (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]
    faces = [(0,3,2,1), (4,5,6,7), (0,1,5,4), (1,2,6,5),
             (2,3,7,6), (3,0,4,7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = _link(bpy.data.objects.new(name, mesh), collection)
    obj.location = center
    if bevel:
        mod = obj.modifiers.new('Soft architectural edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        norm = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        norm.keep_sharp = True
    return obj


def _boxes(name, boxes, material, collection):
    """Batch repeated windows/louvers into a single editable mesh."""
    vertices, faces = [], []
    cube_faces = [(0,3,2,1), (4,5,6,7), (0,1,5,4), (1,2,6,5),
                  (2,3,7,6), (3,0,4,7)]
    for center, size in boxes:
        x, y, z = (s / 2 for s in size)
        cx, cy, cz = center
        offset = len(vertices)
        vertices.extend([(cx+vx, cy+vy, cz+vz) for vx,vy,vz in
                         [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
                          (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]])
        faces.extend(tuple(offset + v for v in f) for f in cube_faces)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    return _link(bpy.data.objects.new(name, mesh), collection)


def _text(name, body, pos, size, material, collection, spacing=1.05):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.space_character = spacing
    curve.extrude = 0.012
    curve.bevel_depth = 0.004
    curve.materials.append(material)
    obj = _link(bpy.data.objects.new(name, curve), collection)
    obj.location = pos
    obj.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    return obj


def _cylinder(name, center, radius, depth, material, collection, vertices=20):
    verts = []
    for z in [-depth/2, depth/2]:
        verts.extend([(radius*math.cos(2*math.pi*i/vertices),
                       radius*math.sin(2*math.pi*i/vertices), z)
                      for i in range(vertices)])
    faces = [(i, (i+1)%vertices, (i+1)%vertices+vertices, i+vertices)
             for i in range(vertices)]
    faces += [tuple(reversed(range(vertices))), tuple(range(vertices, 2*vertices))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    obj = _link(bpy.data.objects.new(name, mesh), collection)
    obj.location = center
    return obj


def _hotel(collection, materials, rng, label, y, width, height, color,
           style='bands', depth=12):
    front = -11.3
    center_x = front - depth/2
    wall, cream, turquoise = materials[color], materials['ivory'], materials['turquoise']
    floor_height = 2.9
    _box(label + ' / main volume', (center_x, y, height/2 + .12),
         (depth, width, height), wall, collection, .32)
    _box(label + ' / granite plinth', (center_x+.02, y, .43),
         (depth+.12, width+.12, .6), materials['stone'], collection, .12)

    # Layered roof cornice is a characteristic Art Deco silhouette.
    for step in range(3):
        _box(label + ' / roof cornice %s' % step,
             (center_x, y, height+.15+step*.19),
             (depth+.65-step*.18, width+.72-step*.22, .17),
             cream if step != 1 else materials['cyan'], collection, .09)
    _box(label + ' / rooftop pavilion', (center_x-2, y+width*.12, height+1.12),
         (depth*.55, width*.52, 1.9), wall, collection, .25)
    _box(label + ' / pavilion coping', (center_x-2, y+width*.12, height+2.11),
         (depth*.55+.35, width*.52+.35, .17), cream, collection, .07)
    for ac_y in [y-width*.28, y+width*.27]:
        _box(label + ' / rooftop air conditioning', (center_x-3, ac_y, height+1.1),
             (2, 1.5, 1.2), materials['metal'], collection, .1)
        _boxes(label + ' / cooling louvers',
               [((center_x-1.97, ac_y+offset*.19, height+1.1), (.035,.08,.75))
                for offset in range(-3,4)], materials['glass'], collection)

    # Lobby windows and metal entrance frames.
    ground_panels, mullions, lit_windows, dark_windows = [], [], [], []
    bays = max(4, int(width/2.5))
    for j in range(bays):
        wy = y-width/2+(j+.5)*width/bays
        ground_panels.append(((front+.025, wy, 1.8), (.06,width/bays-.22,2.6)))
        mullions.append(((front+.12, wy-width/bays/2+.06,1.8),(.18,.12,2.85)))
    _boxes(label + ' / lobby glazing', ground_panels, materials['glass'], collection)
    _boxes(label + ' / lobby piers', mullions, cream, collection)

    floors = int((height-3.1)/floor_height)
    for floor in range(floors):
        wz = 4.7 + floor*floor_height
        if style == 'bands':
            _box(label + ' / wraparound sunshade', (center_x+.15,y,wz+1),
                 (depth+.7,width+.45,.18), cream,collection,.08)
        elif style == 'balconies':
            _box(label + ' / balcony deck', (front+.54,y,wz-.9),
                 (1.4,width+.3,.2),cream,collection,.08)
            _box(label + ' / balcony glass', (front+1.13,y,wz-.36),
                 (.06,width-.15,.85),materials['balcony'],collection,.02)
            _box(label + ' / balcony handrail', (front+1.15,y,wz+.1),
                 (.12,width+.02,.07),cream,collection,.02)
        for j in range(bays):
            wy = y-width/2+(j+.5)*width/bays
            width_window = width/bays-.5
            target = lit_windows if rng.random()<.3 else dark_windows
            target.append(((front+.035,wy,wz),(.08,width_window,1.6)))
            mullions.append(((front+.1,wy,wz),(.1,.065,1.65)))
        # Facing south, visible to the establishing camera.
        for k in range(3):
            wx = front-2-k*3.3
            target=lit_windows if rng.random()<.3 else dark_windows
            target.append(((wx,y-width/2-.035,wz),(1.7,.08,1.65)))
    if style=='ribs':
        for j in range(bays+1):
            wy=y-width/2+j*width/bays
            _box(label+' / vertical fin',(front+.22,wy,height/2+1.5),
                 (.55,.15,height-3),cream,collection,.04)
    _boxes(label+' / dark glazing',dark_windows,materials['glass'],collection)
    _boxes(label+' / warm hotel windows',lit_windows,materials['window_light'],collection)
    _boxes(label+' / window mullions',mullions,materials['metal'],collection)

    # Street canopy and small signboard make the ground floor legible.
    _box(label+' / entrance canopy',(front+1.2,y,3.3),
         (2.9,width*.65,.3),cream,collection,.13)
    _box(label+' / glowing canopy edge',(front+2.66,y,3.29),
         (.045,width*.64,.075),materials['pink'] if color=='mint' else materials['cyan'],collection,.02)
    _box(label+' / sign panel',(front+.24,y,height-1.05),
         (.25,width*.9,1.65),materials['sign'],collection,.1)
    _text(label+' / marquee',label,(front+.39,y,height-1.0),
          min(.96,width/(len(label)*.72)),materials['pink'] if color in ['ivory','mint']
          else materials['cyan'],collection,1.2)

    # Three-step ziggurat above the front center.
    for i in range(3):
        _box(label+' / deco crown',(front-.45,y,height+.6+i*.45),
             (1.1,3.6-i*.7,.5),cream,collection,.1)
    for offset in [-1,0,1]:
        _box(label+' / crown neon',(front+.13,y+offset*.7,height+.9),
             (.06,.08,2.25),materials['pink'],collection,.015)

    # Striped awnings: mesh strips avoid textures and pack cleanly in .blend.
    for section in [-1,1]:
        awny=y+section*width*.32
        for stripe in range(9):
            strip=_box(label+' / canvas awning stripe',
                       (front+.92,awny+(stripe-4)*.31,2.85),
                       (1.6,.31,.08),wall if stripe%2==0 else cream,collection)
            strip.rotation_euler[1]=-.12
        _box(label+' / canvas valance',(front+1.72,awny,2.65),
             (.08,2.8,.3),wall,collection,.02)


def _cafe(collection, m):
    for idx, y in enumerate([-1.5, 4, 9.5]):
        x=-8.95
        _cylinder('Cafe / table pedestal',(x,y,.58),.065,1.05,m['metal'],collection)
        _cylinder('Cafe / terrazzo table',(x,y,1.12),.58,.1,m['ivory'],collection,32)
        for side in [-1,1]:
            _box('Cafe / chair seat',(x,y+side*.94,.58),(.5,.48,.12),m['coral'],collection,.06)
            _box('Cafe / chair back',(x,y+side*1.13,.92),(.52,.1,.62),m['coral'],collection,.06)
            for legx in [-.18,.18]:
                for legy in [-.17,.17]:
                    _box('Cafe / chair leg',(x+legx,y+side*.94+legy,.3),
                         (.055,.055,.53),m['metal'],collection)
        # Octagonal parasol has alternating canvas panels.
        _cylinder('Cafe / umbrella pole',(x,y,1.6),.036,3.1,m['ivory'],collection)
        verts=[(x,y,3.22)]+[(x+1.47*math.cos(j*math.pi/4),
                                         y+1.47*math.sin(j*math.pi/4),2.86) for j in range(8)]
        mesh=bpy.data.meshes.new('Cafe / parasol fabric')
        mesh.from_pydata(verts,[],[(0,j+1,(j+1)%8+1) for j in range(8)])
        mesh.materials.append(m['ivory']); mesh.materials.append(m['mint'])
        for poly in mesh.polygons: poly.material_index=poly.index%2
        _link(bpy.data.objects.new('Cafe / striped parasol',mesh),collection)


def _skyline(collection, m, rng):
    # A second, deliberately simpler layer gives the avenue a city-scale horizon.
    specs=[(-39,22,11,10,27),(-48,40,12,12,36),(-34,46,10,11,23),
           (-59,63,13,12,43),(-40,68,11,10,31),(-30,82,12,11,25),
           (-48,92,15,13,40),(-66,89,13,13,34),(-31,105,11,12,32)]
    for index,(x,y,w,d,h) in enumerate(specs):
        color=m['skyline_a'] if index%2 else m['skyline_b']
        _box('Skyline / tower %02d'%index,(x,y,h/2),(w,d,h),color,collection,.24)
        _box('Skyline / stepped penthouse',(x,y,h+1.4),(w*.65,d*.65,2.8),color,collection,.18)
        windows=[]
        for z in range(4,int(h),3):
            _box('Skyline / floor ribbon',(x,y,z),(w+.12,d+.12,.13),m['skyline_trim'],collection)
            for col in range(max(2,int(d/2))):
                wy=y-d/2+1.2+col*1.8
                if rng.random()<.32:
                    windows.append(((x+w/2+.03,wy,z+1),(.06,.72,1.3)))
            for col in range(max(2,int(w/2))):
                wx=x-w/2+1.2+col*1.8
                if rng.random()<.28:
                    windows.append(((wx,y-d/2-.03,z+1),(.72,.06,1.3)))
        _boxes('Skyline / illuminated offices',windows,m['distant_light'],collection)
        if index in [1,3,6]:
            _cylinder('Skyline / roof antenna',(x,y,h+4.2),.06,4,m['metal'],collection,8)
            _cylinder('Skyline / aircraft beacon',(x,y,h+6.25),.1,.15,m['pink'],collection,8)


def build_city(collection=None):
    """Add five detailed hotels and a distant skyline; return their collection.

    Main building extents: X [-24.5,-8.6], Y [-42.4,55.4], Z [0.12,19.8].
    Skyline extents: approximately X [-73,-24], Y [17,111], Z [0,49.3].
    """
    if collection is None:
        collection=bpy.data.collections.new('02 · Ocean Drive Architecture')
        bpy.context.scene.collection.children.link(collection)
    rng=random.Random(610)
    m={
        'ivory':_material('Architecture / warm porcelain',(.88,.79,.63)),
        'coral':_material('Architecture / flamingo coral',(.75,.22,.25)),
        'mint':_material('Architecture / seafoam',(.27,.65,.53)),
        'lilac':_material('Architecture / lavender',(.52,.35,.65)),
        'turquoise':_material('Architecture / turquoise',(.055,.52,.58)),
        'stone':_material('Architecture / charcoal terrazzo',(.075,.10,.14),roughness=.65),
        'metal':_material('Architecture / anodised aluminum',(.36,.48,.52),metallic=.65,roughness=.3),
        'glass':_material('Architecture / midnight glazing',(.025,.1,.16),metallic=.55,roughness=.22),
        'balcony':_material('Architecture / turquoise balcony',(.08,.35,.38),metallic=.6,roughness=.2),
        'window_light':_material('Architecture / warm room lights',(.95,.52,.21),emission=.7),
        'cyan':_material('Architecture / aqua neon',(.06,.85,.94),emission=3),
        'pink':_material('Architecture / hot pink neon',(.97,.10,.44),emission=3),
        'sign':_material('Architecture / sign charcoal',(.025,.035,.065),roughness=.35),
        'skyline_a':_material('Skyline / mauve concrete',(.22,.20,.34)),
        'skyline_b':_material('Skyline / blue concrete',(.12,.24,.31)),
        'skyline_trim':_material('Skyline / facade stripes',(.27,.34,.40)),
        'distant_light':_material('Skyline / offices',(.95,.60,.27),emission=.6),
    }
    buildings=[
        ('NOVA PALMS',-35,14,9.2,'coral','bands',11),
        ('OCEAN DRIVE',-17,17,13.7,'ivory','ribs',12),
        ('PALM CLUB',4,18,11,'mint','bands',12),
        ('SUNSET MOTEL',25,17,15.3,'lilac','balconies',12),
        ('THE RIVIERA',46,18,17.5,'coral','bands',13),
    ]
    for label,y,w,h,color,style,depth in buildings:
        sub=bpy.data.collections.new(label)
        collection.children.link(sub)
        _hotel(sub,m,rng,label,y,w,h,color,style,depth)
    cafe=bpy.data.collections.new('Palm Club · sidewalk cafe')
    collection.children.link(cafe)
    _cafe(cafe,m)
    skyline=bpy.data.collections.new('Downtown skyline')
    collection.children.link(skyline)
    _skyline(skyline,m,rng)
    return collection
