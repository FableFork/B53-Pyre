import { useState, useEffect, useCallback } from 'react'
import type { RenderJob, LogLine } from '@shared/types'

export function useJobs() {
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  useEffect(() => {
    window.pyre.getJobs().then(setJobs)

    const unsubUpdate = window.pyre.on('job:update', (job: RenderJob) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id)
        if (idx === -1) return [...prev, job]
        const next = [...prev]
        next[idx] = job
        return next
      })
    })

    const unsubRemoved = window.pyre.on('job:removed', (jobId: string) => {
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
      setSelectedJobId((prev) => (prev === jobId ? null : prev))
    })

    const unsubReorder = window.pyre.on('jobs:reorder', (ordered: RenderJob[]) => {
      setJobs(ordered)
    })

    const unsubLog = window.pyre.on('job:log', ({ jobId, line }: { jobId: string; line: LogLine }) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === jobId)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          logLines: [...next[idx].logLines.slice(-2000), line],
        }
        return next
      })
    })

    return () => {
      unsubUpdate()
      unsubRemoved()
      unsubReorder()
      unsubLog()
    }
  }, [])

  const addJob = useCallback(async (filePath: string) => {
    const job = await window.pyre.addJob(filePath)
    setJobs((prev) => [...prev, job])
    setSelectedJobId(job.id)
    return job
  }, [])

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null

  return { jobs, selectedJob, selectedJobId, setSelectedJobId, addJob }
}
