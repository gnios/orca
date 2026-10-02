import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  RefreshCw,
  FolderGit2,
  CheckCircle2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import type {
  LineageGitStatusPayload,
  LineageProjectStatus
} from '../../../../../../shared/fleet-lineage-types'
import { ProjectSourceControlScope } from './ProjectSourceControlScope'

export interface LineageSourceControlProps {
  parentWorkspaceKey?: string
  initialData?: LineageGitStatusPayload
  onOpenFileDiff?: (worktreeId: string, filePath: string, staged: boolean) => void
}

export function LineageSourceControl({
  parentWorkspaceKey,
  initialData,
  onOpenFileDiff
}: LineageSourceControlProps): React.JSX.Element {
  const storeActiveWorkspaceKey = useAppStore((s) => s.activeWorkspaceKey)
  const targetKey = parentWorkspaceKey ?? storeActiveWorkspaceKey ?? ''

  const [statusData, setStatusData] = useState<LineageGitStatusPayload | null>(initialData ?? null)
  const [loading, setLoading] = useState<boolean>(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})

  const fetchStatus = useCallback(async () => {
    if (!targetKey) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      let result: LineageGitStatusPayload | null = null
      if ((window as any).api?.git?.lineageGetStatus) {
        result = await (window as any).api.git.lineageGetStatus({
          parentWorkspaceKey: targetKey
        })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        result = await (window as any).electron.ipcRenderer.invoke('git:lineage-get-status', {
          parentWorkspaceKey: targetKey
        })
      }

      if (result) {
        setStatusData(result)
        // Default all projects with changes to open
        const initialOpen: Record<string, boolean> = {}
        if (result.projects) {
          for (const [repoName, proj] of Object.entries(result.projects)) {
            const hasChanges =
              (proj.totalDirtyFiles ?? 0) > 0 ||
              proj.worktrees.some((w) => w.dirtyFiles && w.dirtyFiles.length > 0)
            if (hasChanges) {
              initialOpen[repoName] = true
            }
          }
        }
        setOpenProjects((prev) => ({ ...initialOpen, ...prev }))
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load lineage status')
    } finally {
      setLoading(false)
    }
  }, [targetKey])

  useEffect(() => {
    if (!initialData) {
      fetchStatus()
    } else {
      // Set initial open projects based on initialData
      const initialOpen: Record<string, boolean> = {}
      if (initialData.projects) {
        for (const [repoName, proj] of Object.entries(initialData.projects)) {
          const hasChanges =
            (proj.totalDirtyFiles ?? 0) > 0 ||
            proj.worktrees.some((w) => w.dirtyFiles && w.dirtyFiles.length > 0)
          if (hasChanges) {
            initialOpen[repoName] = true
          }
        }
      }
      setOpenProjects(initialOpen)
      setLoading(false)
    }
  }, [fetchStatus, initialData])

  const toggleProject = (repoName: string) => {
    setOpenProjects((prev) => ({
      ...prev,
      [repoName]: !prev[repoName]
    }))
  }

  // Calculate projects that have dirty files
  const activeProjects: Array<{ repoName: string; project: LineageProjectStatus; dirtyCount: number }> =
    []
  let overallDirtyFiles = 0

  if (statusData?.projects) {
    for (const [repoName, project] of Object.entries(statusData.projects)) {
      let count = 0
      for (const wt of project.worktrees) {
        count += wt.dirtyFiles?.length ?? 0
      }
      overallDirtyFiles += count
      if (count > 0) {
        activeProjects.push({ repoName, project, dirtyCount: count })
      }
    }
  }

  // Loading state
  if (loading && !statusData) {
    return (
      <div className="flex items-center justify-center h-full p-4 text-xs text-muted-foreground gap-2">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Loading lineage status...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-xs text-red-500 gap-2">
        <span>{error}</span>
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          Retry
        </Button>
      </div>
    )
  }

  // Clean state (AC 14 / C13)
  if (overallDirtyFiles === 0 || activeProjects.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground"
        data-testid="clean-lineage-state"
      >
        <CheckCircle2 className="h-8 w-8 text-green-500/70 mb-2" />
        <div className="text-xs font-medium text-foreground mb-1">
          No changes across lineage worktrees
        </div>
        <div className="text-[11px] text-muted-foreground max-w-[200px]">
          All child repositories in this lineage are up to date.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto text-xs" data-testid="lineage-source-control">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 font-medium">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          <span>Lineage Source Control</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
            {overallDirtyFiles}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={fetchStatus}
          title="Refresh Lineage Status"
        >
          <RefreshCw className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>

      {/* Accordions for each Project / Repository */}
      <div className="flex flex-col divide-y divide-border/40" data-testid="lineage-projects-list">
        {activeProjects.map(({ repoName, project, dirtyCount }) => {
          const isOpen = openProjects[repoName] ?? true
          return (
            <div
              key={repoName}
              className="flex flex-col"
              data-testid={`lineage-project-accordion-${repoName}`}
            >
              {/* Top-Level Collapsible Accordion Header */}
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => toggleProject(repoName)}
                aria-expanded={isOpen}
                data-testid={`accordion-trigger-${repoName}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  )}
                  <FolderGit2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate">{repoName}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-muted/40">
                    {dirtyCount} {dirtyCount === 1 ? 'change' : 'changes'}
                  </Badge>
                </div>
              </button>

              {/* Collapsible Content: ProjectSourceControlScope */}
              {isOpen && (
                <ProjectSourceControlScope
                  project={project}
                  onRefresh={fetchStatus}
                  onOpenFileDiff={onOpenFileDiff}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default LineageSourceControl
