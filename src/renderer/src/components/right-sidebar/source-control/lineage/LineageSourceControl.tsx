import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, RefreshCw, FolderGit2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type {
  LineageGitStatusPayload,
  LineageProjectStatus
} from '../../../../../../shared/fleet-lineage-types'
import { ActionButton } from '../listing/action-button'
import { ProjectSourceControlScope } from './ProjectSourceControlScope'
import { LineageOriginBadge } from '../../lineage-origin-badge'
import { useLineageTicketKeys } from './use-lineage-ticket-keys'

export type LineageSourceControlProps = {
  parentWorkspaceKey?: string
  initialData?: LineageGitStatusPayload
  onOpenFileDiff?: (worktreeId: string, filePath: string, staged: boolean) => void
}

type LineageStatusGitApi = {
  lineageGetStatus?: (args: {
    parentWorkspaceKey: string
    ticketKeys?: string[]
  }) => Promise<LineageGitStatusPayload | null>
}

type WindowWithLineageStatus = Window & {
  api?: {
    git?: LineageStatusGitApi
  }
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

export function LineageSourceControl({
  parentWorkspaceKey,
  initialData,
  onOpenFileDiff
}: LineageSourceControlProps): React.JSX.Element {
  const storeActiveWorkspaceKey = useAppStore((s) => s.activeWorkspaceKey)
  const targetKey = parentWorkspaceKey ?? storeActiveWorkspaceKey ?? ''
  const ticketKeys = useLineageTicketKeys(targetKey)

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
      const win = window as unknown as WindowWithLineageStatus
      let result: LineageGitStatusPayload | null = null
      if (win.api?.git?.lineageGetStatus) {
        result = await win.api.git.lineageGetStatus({
          parentWorkspaceKey: targetKey,
          ticketKeys
        })
      } else if (win.electron?.ipcRenderer?.invoke) {
        result = (await win.electron.ipcRenderer.invoke('git:lineage-get-status', {
          parentWorkspaceKey: targetKey
        })) as LineageGitStatusPayload | null
      }

      if (result) {
        setStatusData(result)
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load lineage status')
    } finally {
      setLoading(false)
    }
  }, [targetKey, ticketKeys])

  useEffect(() => {
    if (!initialData) {
      fetchStatus()
    } else {
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

  const { projectList, overallDirtyFiles } = useMemo(() => {
    const list: {
      repoName: string
      project: LineageProjectStatus
      dirtyCount: number
      primaryBranch: string
    }[] = []
    let total = 0

    if (statusData?.projects) {
      for (const [repoName, project] of Object.entries(statusData.projects)) {
        let count = 0
        for (const wt of project.worktrees) {
          count += wt.dirtyFiles?.length ?? 0
        }
        total += count
        const primaryBranch = project.worktrees[0]?.branch || ''
        list.push({ repoName, project, dirtyCount: count, primaryBranch })
      }
    }

    list.sort((a, b) => {
      // why: prioritize repositories with uncommitted changes at top
      if (a.dirtyCount > 0 && b.dirtyCount === 0) {
        return -1
      }
      if (a.dirtyCount === 0 && b.dirtyCount > 0) {
        return 1
      }
      return a.repoName.localeCompare(b.repoName)
    })

    return { projectList: list, overallDirtyFiles: total }
  }, [statusData])

  if (loading && !statusData) {
    return (
      <div className="flex items-center justify-center h-full p-4 text-xs text-muted-foreground gap-2">
        <RefreshCw className="size-3.5 animate-spin text-primary" />
        <span>Loading lineage status...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-xs text-destructive gap-2">
        <span>{error}</span>
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          Retry
        </Button>
      </div>
    )
  }

  if (overallDirtyFiles === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground"
        data-testid="clean-lineage-state"
      >
        <CheckCircle2 className="size-8 text-workspace-status-review/70 mb-2" />
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
    <TooltipProvider>
      <div
        className="flex flex-col h-full overflow-y-auto scrollbar-sleek text-xs"
        data-testid="lineage-source-control"
      >
        <div className="border-b border-border px-3 pt-2 pb-1.5 flex items-center justify-between sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs tracking-wider uppercase text-foreground/80">
              Source Control
            </span>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {overallDirtyFiles}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ActionButton icon={RefreshCw} title="Refresh All" onClick={fetchStatus} />
          </div>
        </div>

        <div
          className="flex flex-col divide-y divide-border/40"
          data-testid="lineage-projects-list"
        >
          {projectList.map(({ repoName, project, dirtyCount, primaryBranch }) => {
            const isOpen = openProjects[repoName] ?? dirtyCount > 0
            return (
              <div
                key={repoName}
                className="flex flex-col"
                data-testid={`lineage-project-accordion-${repoName}`}
              >
                <div className="pl-1 pr-3 pt-1.5 pb-1">
                  <div className="group/section flex items-center gap-x-1 rounded-md pr-1 hover:bg-accent hover:text-accent-foreground">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-auto min-h-7 min-w-0 flex-1 justify-start gap-x-1.5 py-1 text-left font-semibold tracking-wide text-foreground group-hover/section:text-accent-foreground"
                      onClick={() => toggleProject(repoName)}
                      aria-expanded={isOpen}
                      data-testid={`accordion-trigger-${repoName}`}
                    >
                      <ChevronDown
                        className={cn(
                          'size-3.5 shrink-0 text-muted-foreground transition-transform',
                          !isOpen && '-rotate-90'
                        )}
                      />
                      <FolderGit2 className="size-4 text-primary shrink-0" />
                      <span className="min-w-0 flex-1 flex items-center gap-1.5 truncate">
                        <span className="truncate text-xs font-semibold" title={repoName}>
                          {repoName}
                        </span>
                        <LineageOriginBadge
                          matchedBy={project.worktrees[0]?.matchedBy}
                          reasons={project.worktrees[0]?.reason}
                        />
                        {primaryBranch && (
                          <span className="text-[11px] text-muted-foreground font-normal truncate">
                            ({primaryBranch})
                          </span>
                        )}
                        <span className="shrink-0 text-[11px] font-medium tabular-nums ml-auto mr-1">
                          {dirtyCount}
                        </span>
                      </span>
                    </Button>
                    <div className="flex shrink-0 items-center justify-end">
                      <ActionButton
                        icon={RefreshCw}
                        title="Refresh"
                        onClick={(e) => {
                          e.stopPropagation()
                          fetchStatus()
                        }}
                      />
                    </div>
                  </div>
                </div>

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
    </TooltipProvider>
  )
}

export default LineageSourceControl
