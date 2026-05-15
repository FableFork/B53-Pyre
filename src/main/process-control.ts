import { spawnSync } from 'child_process'
import * as os from 'os'

// One Add-Type block that registers both Nt* calls in a single session.
// We use two different type names (SuspendApi / ResumeApi) so repeated calls
// in the same session don't hit a "type already exists" error — but since each
// spawnSync creates a fresh PS session, this is belt-and-suspenders only.
const PS_SUSPEND = (pid: number) => `
try {
  Add-Type -Namespace PyreSuspend -Name Api -MemberDefinition '
    [DllImport("ntdll.dll")] public static extern uint NtSuspendProcess(IntPtr h);
  ' -ErrorAction SilentlyContinue
  $p = [System.Diagnostics.Process]::GetProcessById(${pid})
  [PyreSuspend.Api]::NtSuspendProcess($p.Handle) | Out-Null
} catch { exit 1 }
`

const PS_RESUME = (pid: number) => `
try {
  Add-Type -Namespace PyreResume -Name Api -MemberDefinition '
    [DllImport("ntdll.dll")] public static extern uint NtResumeProcess(IntPtr h);
  ' -ErrorAction SilentlyContinue
  $p = [System.Diagnostics.Process]::GetProcessById(${pid})
  [PyreResume.Api]::NtResumeProcess($p.Handle) | Out-Null
} catch { exit 1 }
`

function runPs(script: string): boolean {
  const r = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script
  ], { timeout: 10000 })
  return r.status === 0
}

export function suspendProcess(pid: number): boolean {
  if (os.platform() !== 'win32') {
    try { process.kill(pid, 'SIGSTOP'); return true } catch { return false }
  }
  return runPs(PS_SUSPEND(pid))
}

export function resumeProcess(pid: number): boolean {
  if (os.platform() !== 'win32') {
    try { process.kill(pid, 'SIGCONT'); return true } catch { return false }
  }
  return runPs(PS_RESUME(pid))
}
