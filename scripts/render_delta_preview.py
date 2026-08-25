import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

glb = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out = Path(sys.argv[sys.argv.index("--") + 2]).resolve()

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))

scene = bpy.context.scene
assembly = next((obj for obj in bpy.data.objects if obj.name == "assembly"), None)
if assembly is None:
    raise SystemExit("No object named 'assembly' in GLB")

def rooted_at(obj, root):
    cur = obj
    while cur:
        if cur == root:
            return True
        cur = cur.parent
    return False

keep = {obj for obj in bpy.data.objects if rooted_at(obj, assembly)}
print("kept objects", len(keep), [obj.name for obj in keep][:20])

for obj in list(bpy.data.objects):
    if obj not in keep:
        bpy.data.objects.remove(obj, do_unlink=True)

# World / lighting
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.012, 0.012, 0.014, 1)
bg.inputs[1].default_value = 1.0

mat = bpy.data.materials.new("CadSolid")
mat.use_nodes = True
principled = mat.node_tree.nodes["Principled BSDF"]
principled.inputs["Base Color"].default_value = (0.89, 0.92, 0.95, 1)
principled.inputs["Metallic"].default_value = 0.58
principled.inputs["Roughness"].default_value = 0.3
for obj in bpy.data.objects:
    if obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(mat)

# Camera from a three-quarter view, similar to the Halbach settings card
depsgraph = bpy.context.evaluated_depsgraph_get()
bbox_min = Vector((math.inf, math.inf, math.inf))
bbox_max = Vector((-math.inf, -math.inf, -math.inf))
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        for vert in mesh.vertices:
            world_co = evaluated.matrix_world @ vert.co
            bbox_min.x = min(bbox_min.x, world_co.x)
            bbox_min.y = min(bbox_min.y, world_co.y)
            bbox_min.z = min(bbox_min.z, world_co.z)
            bbox_max.x = max(bbox_max.x, world_co.x)
            bbox_max.y = max(bbox_max.y, world_co.y)
            bbox_max.z = max(bbox_max.z, world_co.z)
    finally:
        evaluated.to_mesh_clear()

print("bbox", tuple(bbox_min), tuple(bbox_max))

center = (bbox_min + bbox_max) * 0.5
size = (bbox_max - bbox_min).length
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 35
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
direction = Vector((0.95, -1.35, 0.62)).normalized()
cam.location = center + direction * size * 2.6
cam.data.clip_start = 0.001
cam.data.clip_end = max(100.0, size * 20.0)
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

key = bpy.data.lights.new("Key", "AREA")
key.energy = 250
key.size = size
key_obj = bpy.data.objects.new("Key", key)
key_obj.location = center + Vector((size * 0.8, -size * 0.4, size * 1.1))
scene.collection.objects.link(key_obj)

fill = bpy.data.lights.new("Fill", "AREA")
fill.energy = 80
fill.size = size
fill_obj = bpy.data.objects.new("Fill", fill)
fill_obj.location = center + Vector((-size * 0.9, -size * 0.6, size * 0.4))
scene.collection.objects.link(fill_obj)

scene.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(bpy.types, "Scene") else "BLENDER_EEVEE"
scene.render.resolution_x = 1024
scene.render.resolution_y = 840
scene.render.film_transparent = False
scene.render.filepath = str(out)
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
