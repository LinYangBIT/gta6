"""Render extra stills or a lightweight 10-second movie from the saved .blend.
Run with: blender -b scenes/sunset_coast.blend --python scripts/render_previews.py
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import bpy
import _cycles

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--mode',choices=('stills','animation'),default='stills')
parser.add_argument('--resolution',type=int,default=1200)
parser.add_argument('--samples',type=int,default=48)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=args.samples
scene.cycles.use_denoising=bool(getattr(_cycles,'with_openimagedenoise',False))
scene.render.resolution_x=args.resolution
scene.render.resolution_y=int(args.resolution*.625)
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.frame_set(1)
output=ROOT/'previews'
output.mkdir(exist_ok=True)

if args.mode=='stills':
    for prefix,filename in (('02 ·','hero_car.png'),('03 ·','coast_aerial.png')):
        scene.camera=next(o for o in scene.objects if o.type=='CAMERA' and o.name.startswith(prefix))
        scene.render.filepath=str(output/filename)
        bpy.ops.render.render(write_still=True)
        print('PREVIEW_OK',filename,flush=True)
else:
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('Install FFmpeg and add it to PATH to encode the animation preview.')
    frames=output/'frames'
    frames.mkdir(exist_ok=True)
    scene.camera=next(o for o in scene.objects if o.type=='CAMERA' and o.name.startswith('01 ·'))
    # 8 fps draft: every third native frame, 80 images, 10 seconds.
    for number,frame in enumerate(range(1,241,3)):
        scene.frame_set(frame)
        scene.render.filepath=str(frames/f'{number:04d}.png')
        bpy.ops.render.render(write_still=True)
    target=output/'sunset_cruise.mp4'
    subprocess.run([ffmpeg,'-y','-framerate','8','-i',str(frames/'%04d.png'),
                    '-c:v','libx264','-pix_fmt','yuv420p','-crf','20',
                    '-movflags','+faststart',str(target)],check=True)
    print('MOVIE_OK',target,flush=True)
