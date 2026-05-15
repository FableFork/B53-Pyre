"""Blender probe script — run inside Blender via --python flag.

Usage:
    blender --background file.blend --python blender_probe.py --
"""
import bpy
import json
import sys


def get_pass_state(vl):
    return {
        'combined': vl.use_pass_combined,
        'z': vl.use_pass_z,
        'normal': vl.use_pass_normal,
        'vector': vl.use_pass_vector,
        'uv': vl.use_pass_uv,
        'object_index': vl.use_pass_object_index,
        'diffuse_direct': vl.use_pass_diffuse_direct,
        'diffuse_indirect': vl.use_pass_diffuse_indirect,
        'diffuse_color': vl.use_pass_diffuse_color,
        'glossy_direct': vl.use_pass_glossy_direct,
        'glossy_indirect': vl.use_pass_glossy_indirect,
        'glossy_color': vl.use_pass_glossy_color,
        'transmission_direct': vl.use_pass_transmission_direct,
        'transmission_indirect': vl.use_pass_transmission_indirect,
        'emit': vl.use_pass_emit,
        'environment': vl.use_pass_environment,
        'shadow': vl.use_pass_shadow,
        'ambient_occlusion': vl.use_pass_ambient_occlusion,
        'cryptomatte_object': vl.use_pass_cryptomatte_object,
        'cryptomatte_material': vl.use_pass_cryptomatte_material,
        'cryptomatte_asset': vl.use_pass_cryptomatte_asset,
    }


def probe():
    data = {}

    for scene in bpy.data.scenes:
        view_layers = []
        for vl in scene.view_layers:
            view_layers.append({
                'name': vl.name,
                'enabled': vl.use,
                'passes': get_pass_state(vl),
            })

        samples_cycles = None
        if scene.render.engine == 'CYCLES' and hasattr(scene, 'cycles'):
            try:
                samples_cycles = scene.cycles.samples
            except Exception:
                pass

        samples_eevee = None
        if scene.render.engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT') and hasattr(scene, 'eevee'):
            try:
                samples_eevee = scene.eevee.taa_render_samples
            except Exception:
                pass

        engine = scene.render.engine
        if engine not in ('CYCLES', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
            engine = 'CYCLES'

        data[scene.name] = {
            'name': scene.name,
            'cameras': [o.name for o in scene.objects if o.type == 'CAMERA'],
            'view_layers': view_layers,
            'frame_start': scene.frame_start,
            'frame_end': scene.frame_end,
            'frame_step': scene.frame_step,
            'fps': scene.render.fps,
            'resolution_x': scene.render.resolution_x,
            'resolution_y': scene.render.resolution_y,
            'resolution_percentage': scene.render.resolution_percentage,
            'engine': engine,
            'output_path': scene.render.filepath,
            'file_format': scene.render.image_settings.file_format,
            'color_depth': scene.render.image_settings.color_depth,
            'collections': [c.name for c in bpy.data.collections],
            'compositor_enabled': scene.use_nodes,
            'samples_cycles': samples_cycles,
            'samples_eevee': samples_eevee,
        }

    print('PYRE_PROBE_START')
    print(json.dumps(data))
    print('PYRE_PROBE_END')
    sys.stdout.flush()


probe()
