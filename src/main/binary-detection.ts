import { execFileSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface DetectResult {
  path: string | null
  version: string | null
}

// ─── Blender ──────────────────────────────────────────────────────────────────

const BLENDER_WIN_DIRS = [
  'C:\\Program Files\\Blender Foundation',
  'C:\\Program Files (x86)\\Blender Foundation'
]

const BLENDER_LINUX_PATHS = [
  '/usr/bin/blender',
  '/usr/local/bin/blender',
  '/snap/bin/blender',
  '/opt/blender/blender'
]

function findBlenderInDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null
  try {
    const entries = fs.readdirSync(dir)
    for (const entry of entries.sort().reverse()) {
      const candidate = path.join(dir, entry, 'blender.exe')
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {}
  return null
}

function getBlenderVersion(blenderPath: string): { version: string | null; output: string; exitCode: number | null } {
  try {
    // On Windows, blender.exe is a GUI-subsystem app — stdout isn't captured
    // unless we go through cmd.exe (a CUI process that can redirect GUI app I/O).
    const isWin = os.platform() === 'win32'
    const result = isWin
      ? spawnSync('cmd', ['/c', blenderPath, '--version'], {
          timeout: 10000,
          encoding: 'utf8',
          windowsHide: true
        })
      : spawnSync(blenderPath, ['--version'], {
          timeout: 10000,
          encoding: 'utf8'
        })
    const output = (result.stdout || '') + (result.stderr || '')
    const match = output.match(/Blender\s+([\d.]+)/)
    return { version: match ? match[1] : null, output, exitCode: result.status }
  } catch (e) {
    return { version: null, output: (e as Error).message, exitCode: null }
  }
}

export function detectBlender(): DetectResult {
  const ver = (p: string) => getBlenderVersion(p).version

  // 1. Check PATH
  const fromPath = which('blender')
  if (fromPath) return { path: fromPath, version: ver(fromPath) }

  if (os.platform() === 'win32') {
    // 2. Check Program Files dirs
    for (const dir of BLENDER_WIN_DIRS) {
      const found = findBlenderInDir(dir)
      if (found) return { path: found, version: ver(found) }
    }
    // 3. Registry (best-effort)
    try {
      const regOut = execFileSync('reg', [
        'query',
        'HKLM\\SOFTWARE\\BlenderFoundation',
        '/s'
      ], { encoding: 'utf8', timeout: 3000 })
      const match = regOut.match(/REG_SZ\s+(.+blender\.exe)/i)
      if (match) {
        const p = match[1].trim()
        if (fs.existsSync(p)) return { path: p, version: ver(p) }
      }
    } catch {}
  } else {
    for (const p of BLENDER_LINUX_PATHS) {
      if (fs.existsSync(p)) return { path: p, version: ver(p) }
    }
  }

  return { path: null, version: null }
}

// ─── Houdini / hython ─────────────────────────────────────────────────────────

const HOUDINI_LINUX_GLOBS = ['/opt/hfs*', '/usr/local/hfs*']

function getHythonVersion(hythonPath: string): string | null {
  try {
    const result = spawnSync(hythonPath, ['--version'], {
      timeout: 8000,
      encoding: 'utf8'
    })
    const output = (result.stdout || '') + (result.stderr || '')
    const match = output.match(/Python\s+([\d.]+).*Houdini\s+([\d.]+)/i) ||
      output.match(/Houdini\s+([\d.]+)/i)
    return match ? match[match.length - 1] : output.trim().slice(0, 30) || null
  } catch {
    return null
  }
}

function findHythonInHoudiniDir(houdiniRoot: string): string | null {
  const exe = os.platform() === 'win32' ? 'hython.exe' : 'hython'
  const candidate = path.join(houdiniRoot, 'bin', exe)
  return fs.existsSync(candidate) ? candidate : null
}

export function detectHoudini(): DetectResult {
  // 1. $HFS env var
  const hfs = process.env.HFS
  if (hfs) {
    const p = findHythonInHoudiniDir(hfs)
    if (p) return { path: p, version: getHythonVersion(p) }
  }

  // 2. PATH
  const fromPath = which('hython')
  if (fromPath) return { path: fromPath, version: getHythonVersion(fromPath) }

  if (os.platform() === 'win32') {
    // 3. Side Effects Software folder
    const sesi = 'C:\\Program Files\\Side Effects Software'
    if (fs.existsSync(sesi)) {
      const versions = fs.readdirSync(sesi).sort().reverse()
      for (const v of versions) {
        const p = findHythonInHoudiniDir(path.join(sesi, v))
        if (p) return { path: p, version: getHythonVersion(p) }
      }
    }
    // 4. Registry
    try {
      const regOut = execFileSync('reg', [
        'query',
        'HKLM\\SOFTWARE\\Side Effects Software',
        '/s'
      ], { encoding: 'utf8', timeout: 3000 })
      const match = regOut.match(/InstallPath\s+REG_SZ\s+(.+)/i)
      if (match) {
        const p = findHythonInHoudiniDir(match[1].trim())
        if (p) return { path: p, version: getHythonVersion(p) }
      }
    } catch {}
  } else {
    // Linux glob patterns
    for (const pattern of HOUDINI_LINUX_GLOBS) {
      const base = pattern.replace('*', '')
      if (!fs.existsSync(base)) continue
      try {
        const parent = path.dirname(base)
        const prefix = path.basename(base)
        const entries = fs.readdirSync(parent).filter((e) => e.startsWith(prefix)).sort().reverse()
        for (const e of entries) {
          const p = findHythonInHoudiniDir(path.join(parent, e))
          if (p) return { path: p, version: getHythonVersion(p) }
        }
      } catch {}
    }
  }

  return { path: null, version: null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function which(cmd: string): string | null {
  try {
    const whichCmd = os.platform() === 'win32' ? 'where' : 'which'
    const result = execFileSync(whichCmd, [cmd], { encoding: 'utf8', timeout: 3000 })
    const line = result.trim().split('\n')[0].trim()
    return line && fs.existsSync(line) ? line : null
  } catch {
    return null
  }
}

export function testBinary(type: 'blender' | 'houdini', binPath: string): { version: string } {
  if (!fs.existsSync(binPath)) throw new Error(`Path does not exist: ${binPath}`)

  if (type === 'blender') {
    const { version, output, exitCode } = getBlenderVersion(binPath)
    if (!version) {
      const snippet = output.trim().slice(0, 300)
      throw new Error(
        `Could not read Blender version (exit ${exitCode}).` +
        (snippet ? `\nOutput: ${snippet}` : '\nNo output received — binary may not be a valid Blender install.')
      )
    }
    return { version }
  }

  // Houdini / hython
  const version = getHythonVersion(binPath)
  if (!version) throw new Error('Could not determine hython version — check that the path points to hython, not houdini.')
  return { version }
}
