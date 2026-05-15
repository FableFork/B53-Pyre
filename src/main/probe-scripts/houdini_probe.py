"""Houdini probe script — run via hython.

Usage:
    hython houdini_probe.py /path/to/file.hip
"""
import hou
import json
import sys
import os


def safe_parm(node, name):
    p = node.parm(name)
    if p is None:
        return None
    try:
        return p.eval()
    except Exception:
        return None


def probe(hip_path):
    hou.hipFile.load(hip_path, suppress_save_prompt=True)

    results = {}
    cameras = []

    for context_path in ['/out', '/stage']:
        context = hou.node(context_path)
        if not context:
            continue
        for child in context.recursiveGlob('*'):
            if child.type().category().name() != 'Driver':
                continue

            aovs = []
            aov_count = safe_parm(child, 'vm_numaux') or 0
            try:
                aov_count = int(aov_count)
            except (TypeError, ValueError):
                aov_count = 0

            for i in range(1, aov_count + 1):
                aovs.append({
                    'variable': safe_parm(child, f'vm_variable_plane{i}'),
                    'vex_variable': safe_parm(child, f'vm_vexvariable_plane{i}'),
                    'enabled': safe_parm(child, f'vm_disable_plane{i}') == 0,
                    'channel': safe_parm(child, f'vm_channel_plane{i}'),
                })

            results[child.path()] = {
                'name': child.name(),
                'type': child.type().name(),
                'path': child.path(),
                'context': context_path,
                'parms': {
                    'frame_start': safe_parm(child, 'f1'),
                    'frame_end': safe_parm(child, 'f2'),
                    'frame_step': safe_parm(child, 'f3'),
                    'renderer': safe_parm(child, 'renderer'),
                    'samples': safe_parm(child, 'samples'),
                    'output_path': safe_parm(child, 'picture'),
                    'res_x': safe_parm(child, 'resx'),
                    'res_y': safe_parm(child, 'resy'),
                    'motion_blur': bool(safe_parm(child, 'mblur')),
                    'denoise': bool(safe_parm(child, 'denoise')),
                    'camera': safe_parm(child, 'camera'),
                    'aovs': aovs,
                },
            }

    # Collect cameras from /obj and /stage
    obj_node = hou.node('/obj')
    if obj_node:
        for child in obj_node.children():
            if child.type().name() == 'cam':
                cameras.append(child.path())

    stage_node = hou.node('/stage')
    if stage_node:
        for node in stage_node.recursiveGlob('*'):
            if node.type().name() == 'camera':
                cameras.append(node.path())

    # File references
    file_refs = []
    try:
        for ref in hou.fileReferences():
            file_refs.append({
                'parm': ref[0].path() if ref[0] else '',
                'path': ref[1],
            })
    except Exception:
        pass

    hip_vars = {
        'HIP': hou.getenv('HIP', ''),
        'JOB': hou.getenv('JOB', ''),
        'HFS': hou.getenv('HFS', ''),
    }

    print('PYRE_PROBE_START')
    print(json.dumps({
        'rops': results,
        'cameras': cameras,
        'file_refs': file_refs,
        'hip_vars': hip_vars,
    }))
    print('PYRE_PROBE_END')
    sys.stdout.flush()


if len(sys.argv) < 2:
    print('Usage: hython houdini_probe.py <hip_file>', file=sys.stderr)
    sys.exit(1)

probe(sys.argv[1])
