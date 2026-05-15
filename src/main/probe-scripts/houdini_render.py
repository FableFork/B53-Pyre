"""Houdini render script — run via hython.

Usage:
    hython houdini_render.py /path/to/file.hip /path/to/config.json
"""
import hou
import json
import sys
import os


def safe_set(node, parm_name, value):
    p = node.parm(parm_name)
    if p is not None and value is not None:
        try:
            p.set(value)
        except Exception as e:
            print(f'Warning: could not set {parm_name}: {e}')


def render(hip_path, config):
    hou.hipFile.load(hip_path, suppress_save_prompt=True)

    rop_path = config.get('selectedROP', '')
    rop = hou.node(rop_path)
    if not rop:
        print(f'ERROR: ROP not found at path: {rop_path}')
        sys.exit(1)

    renderer = config.get('renderer', 'BRAY_HdKarmaXPU')
    safe_set(rop, 'renderer', renderer)

    xpu_mode_map = {
        'gpu_and_cpu': 'xpu_gpu_and_cpu',
        'gpu_only': 'xpu_gpu',
        'cpu_only': 'xpu_cpu',
    }
    xpu_mode = xpu_mode_map.get(config.get('xpuDeviceMode', 'gpu_and_cpu'), 'xpu_gpu_and_cpu')
    # Try karma:global xpu device parm
    karma_global = hou.node('/stage/karma:global') or hou.node('/out/karma:global')
    if karma_global:
        safe_set(karma_global, 'xpu_device', xpu_mode)

    if not config.get('useSourceSettings', True):
        safe_set(rop, 'f1', config.get('frameStart'))
        safe_set(rop, 'f2', config.get('frameEnd'))
        safe_set(rop, 'f3', config.get('frameStep'))
        safe_set(rop, 'resx', config.get('resolutionX'))
        safe_set(rop, 'resy', config.get('resolutionY'))
        safe_set(rop, 'samples', config.get('samples'))

        denoise = config.get('denoise', False)
        safe_set(rop, 'denoise', 1 if denoise else 0)
        if denoise:
            denoiser = config.get('denoiser', 'optix')
            safe_set(rop, 'denoiser', denoiser)

        noise_threshold = config.get('noiseThreshold', 0.01)
        safe_set(rop, 'vm_variance', noise_threshold)

        max_depth = config.get('maxPathDepth', 10)
        safe_set(rop, 'vm_maxraysamples', max_depth)

    output_path = config.get('outputPath', '')
    if output_path:
        safe_set(rop, 'picture', output_path)

    selected_camera = config.get('selectedCamera', '')
    if selected_camera:
        safe_set(rop, 'camera', selected_camera)

    # AOVs
    enabled_aovs = config.get('enabledAOVs', [])
    aov_count_parm = rop.parm('vm_numaux')
    if aov_count_parm is not None:
        current_count = aov_count_parm.eval() or 0
        for i, aov in enumerate(enabled_aovs[:current_count], start=1):
            safe_set(rop, f'vm_disable_plane{i}', 0 if aov.get('enabled', True) else 1)
            if aov.get('output_path_override'):
                safe_set(rop, f'vm_filename_plane{i}', aov['output_path_override'])
            if aov.get('channel'):
                safe_set(rop, f'vm_channel_plane{i}', aov['channel'])

    # Output format parms (Karma USD)
    fmt_map = {
        'exr_multilayer': 'exr',
        'exr_single': 'exr',
        'png': 'png',
        'tiff': 'tiff',
    }
    file_format = fmt_map.get(config.get('fileFormat', 'exr_multilayer'), 'exr')
    safe_set(rop, 'vm_image_exr_compression', config.get('exrCompression', 'zip'))

    print(f'ALF_PROGRESS 0%')
    sys.stdout.flush()

    try:
        rop.render(verbose=True, output_progress=True)
    except hou.OperationFailed as e:
        print(f'ERROR: Render failed: {e}')
        sys.exit(1)

    print(f'ALF_PROGRESS 100%')
    print('PYRE_RENDER_COMPLETE')
    sys.stdout.flush()


if len(sys.argv) < 3:
    print('Usage: hython houdini_render.py <hip> <config.json>', file=sys.stderr)
    sys.exit(1)

with open(sys.argv[2], 'r') as f:
    cfg = json.load(f)

render(sys.argv[1], cfg)
