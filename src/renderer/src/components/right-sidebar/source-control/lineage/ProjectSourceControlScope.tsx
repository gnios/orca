import React, { useState, useCallback } from 'react'
import { FolderGit2, RefreshCw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { GitFileStatus, GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { LineageProjectStatus } from '../../../../../../shared/fleet-lineage-types'
import {
  readCommitDraftForWorktree,
  writeCommitDraftForWorktree,
  type CommitDraftsByWorktree
} from '../commit/commit-drafts'
import { ActionButton } from '../listing/action-button'
import { ProjectSourceControlSectionGroup } from './ProjectSourceControlSectionGroup'
import { translate } from '@/i18n/i18n'

// why: draft persistence across unmounts requires module-level cache across worktrees
const globalLineageCommitDrafts: CommitDraftsByWorktree = {}

export function resetLineageCommitDrafts(): void {
  for (const key of Object.keys(globalLineageCommitDrafts)) {
    delete globalLineageCommitDrafts[key]
  }
}

function normalizeGitStatus(status?: string): GitFileStatus {
  switch (status) {
    case 'M':
    case 'modified':
      return 'modified'
    case 'A':
    case 'added':
      return 'added'
    case 'D':
    case 'deleted':
      return 'deleted'
    case 'R':
    case 'renamed':
      return 'renamed'
    case 'U':
    case 'untracked':
      return 'untracked'
    case 'C':
    case 'copied':
      return 'copied'
    case undefined:
    default:
      return 'modified'
  }
}

function normalizeGitArea(area?: string): 'staged' | 'unstaged' | 'untracked' {
  if (area === 'staged') {
    return 'staged'
  }
  if (area === 'untracked') {
    return 'untracked'
  }
  return 'unstaged'
}

export type ProjectSourceControlScopeProps = {
  project: LineageProjectStatus & {
    worktreePath?: string
    totalDirtyFiles?: number
  }
  onRefresh?: () => void
  onOpenFileDiff?: (worktreeId: string, filePath: string, staged: boolean) => void
}

type ProjectGitApi = {
  stageAll?: (args: { worktreePath: string }) => Promise<void>
  bulkStage?: (args: { worktreePath: string; filePaths: string[] }) => Promise<void>
  unstageAll?: (args: { worktreePath: string }) => Promise<void>
  bulkUnstage?: (args: { worktreePath: string; filePaths: string[] }) => Promise<void>
  discardAll?: (args: { worktreePath: string }) => Promise<void>
  bulkDiscard?: (args: { worktreePath: string; filePaths: string[]; area: string }) => Promise<void>
  stage?: (args: { worktreePath: string; filePath: string }) => Promise<void>
  unstage?: (args: { worktreePath: string; filePath: string }) => Promise<void>
  discard?: (args: { worktreePath: string; filePath: string; area: string }) => Promise<void>
  lineageCommitProject?: (args: {
    worktreePath: string
    message: string
  }) => Promise<{ status?: number; success?: boolean; error?: string }>
}

type WindowWithProjectGit = Window & {
  api?: {
    git?: ProjectGitApi
  }
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

export function ProjectSourceControlScope({
  project,
  onRefresh,
  onOpenFileDiff
}: ProjectSourceControlScopeProps): React.JSX.Element {
  const storeOpenDiff = useAppStore((s) => s.openDiff)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)

  const primaryWorktree = project.worktrees[0]
  const worktreeId = primaryWorktree?.worktreeId ?? project.repoName
  const worktreePath = project.worktreePath ?? primaryWorktree?.worktreePath ?? ''

  const [drafts, setDrafts] = useState<CommitDraftsByWorktree>(globalLineageCommitDrafts)
  const commitMessage = readCommitDraftForWorktree(drafts, worktreeId)

  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitSuccess, setCommitSuccess] = useState(false)

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const next = writeCommitDraftForWorktree(drafts, worktreeId, val)
    globalLineageCommitDrafts[worktreeId] = val
    setDrafts(next)
  }

  const allDirtyFiles: { worktreeId: string; entry: GitStatusEntry }[] = []
  for (const wt of project.worktrees) {
    if (wt.dirtyFiles && Array.isArray(wt.dirtyFiles)) {
      for (const item of wt.dirtyFiles) {
        const rawStatus = typeof item === 'string' ? 'modified' : item.status
        const rawArea = typeof item === 'string' ? 'unstaged' : item.area
        const rawPath = typeof item === 'string' ? item : item.path

        const entry: GitStatusEntry = {
          path: rawPath,
          status: normalizeGitStatus(rawStatus),
          area: normalizeGitArea(rawArea)
        }
        allDirtyFiles.push({ worktreeId: wt.worktreeId, entry })
      }
    }
  }

  const stagedFiles = allDirtyFiles.filter((item) => item.entry.area === 'staged')
  const unstagedFiles = allDirtyFiles.filter((item) => item.entry.area === 'unstaged')
  const untrackedFiles = allDirtyFiles.filter((item) => item.entry.area === 'untracked')

  const handleStageAll = async () => {
    try {
      const win = window as unknown as WindowWithProjectGit
      const filePaths = unstagedFiles.map((f) => f.entry.path)
      if (win.api?.git?.stageAll) {
        await win.api.git.stageAll({ worktreePath })
      } else if (win.api?.git?.bulkStage) {
        await win.api.git.bulkStage({ worktreePath, filePaths })
      } else if (win.electron?.ipcRenderer?.invoke) {
        await win.electron.ipcRenderer.invoke('git:stageAll', { worktreePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to stage all', e)
    }
  }

  const handleUnstageAll = async () => {
    try {
      const win = window as unknown as WindowWithProjectGit
      const filePaths = stagedFiles.map((f) => f.entry.path)
      if (win.api?.git?.unstageAll) {
        await win.api.git.unstageAll({ worktreePath })
      } else if (win.api?.git?.bulkUnstage) {
        await win.api.git.bulkUnstage({ worktreePath, filePaths })
      } else if (win.electron?.ipcRenderer?.invoke) {
        await win.electron.ipcRenderer.invoke('git:unstageAll', { worktreePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to unstage all', e)
    }
  }

  const handleDiscardAll = async () => {
    try {
      const win = window as unknown as WindowWithProjectGit
      const filePaths = unstagedFiles.map((f) => f.entry.path)
      if (win.api?.git?.discardAll) {
        await win.api.git.discardAll({ worktreePath })
      } else if (win.api?.git?.bulkDiscard) {
        await win.api.git.bulkDiscard({ worktreePath, filePaths, area: 'unstaged' })
      } else if (win.electron?.ipcRenderer?.invoke) {
        await win.electron.ipcRenderer.invoke('git:discardAll', { worktreePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to discard all', e)
    }
  }

  const handleStagePath = async (filePath: string) => {
    try {
      const win = window as unknown as WindowWithProjectGit
      if (win.api?.git?.stage) {
        await win.api.git.stage({ worktreePath, filePath })
      } else if (win.electron?.ipcRenderer?.invoke) {
        await win.electron.ipcRenderer.invoke('git:stage', { worktreePath, filePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to stage file', e)
    }
  }

  const handleUnstagePath = async (filePath: string) => {
    try {
      const win = window as unknown as WindowWithProjectGit
      if (win.api?.git?.unstage) {
        await win.api.git.unstage({ worktreePath, filePath })
      } else if (win.electron?.ipcRenderer?.invoke) {
        await win.electron.ipcRenderer.invoke('git:unstage', { worktreePath, filePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to unstage file', e)
    }
  }

  const handleDiscardEntry = async (entry: GitStatusEntry) => {
    try {
      const win = window as unknown as WindowWithProjectGit
      if (win.api?.git?.discard) {
        await win.api.git.discard({ worktreePath, filePath: entry.path, area: entry.area })
      } else if (win.electron?.ipcRenderer?.invoke) {
        await win.electron.ipcRenderer.invoke('git:discard', {
          worktreePath,
          filePath: entry.path,
          area: entry.area
        })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to discard file', e)
    }
  }

  const handleRevealInExplorer = useCallback((targetWtId: string, absPath: string) => {
    // why: optional explorer path reveal from store if supported
    const reveal = useAppStore.getState().revealInExplorer
    if (reveal) {
      reveal(targetWtId, absPath)
    }
  }, [])

  const handleCommit = async () => {
    const trimmed = commitMessage.trim()
    if (!trimmed) {
      return
    }

    setIsCommitting(true)
    setCommitError(null)
    setCommitSuccess(false)

    try {
      const win = window as unknown as WindowWithProjectGit
      let result: { status?: number; success?: boolean; error?: string } | undefined
      if (win.api?.git?.lineageCommitProject) {
        result = await win.api.git.lineageCommitProject({
          worktreePath,
          message: trimmed
        })
      } else if (win.electron?.ipcRenderer?.invoke) {
        result = (await win.electron.ipcRenderer.invoke('git:lineage-commit-project', {
          worktreePath,
          message: trimmed
        })) as { status?: number; success?: boolean; error?: string } | undefined
      }

      if (result && (result.status === 400 || result.status === 500 || result.success === false)) {
        setCommitError(result.error ?? 'Commit failed')
        return
      }

      const next = writeCommitDraftForWorktree(drafts, worktreeId, '')
      globalLineageCommitDrafts[worktreeId] = ''
      setDrafts(next)
      setCommitSuccess(true)
      setTimeout(() => setCommitSuccess(false), 2000)
      onRefresh?.()
    } catch (err: unknown) {
      setCommitError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleFileClick = (targetWorktreeId: string, filePath: string, staged: boolean) => {
    if (onOpenFileDiff) {
      onOpenFileDiff(targetWorktreeId, filePath, staged)
      return
    }
    const rowWorktree = project.worktrees.find((wt) => wt.worktreeId === targetWorktreeId)
    // invariant: a diff tab only opens for a worktree the store owns, never an orphan id
    if (!rowWorktree?.worktreePath || !findWorktreeById(worktreesByRepo ?? {}, targetWorktreeId)) {
      return
    }
    storeOpenDiff?.(
      targetWorktreeId,
      joinPath(rowWorktree.worktreePath, filePath),
      filePath,
      detectLanguage(filePath),
      staged
    )
  }

  return (
    <TooltipProvider>
      <div
        className="flex flex-col border-t border-border/40 text-xs"
        data-testid={`project-scope-${project.repoName}`}
      >
        <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-border/20">
          <div className="flex items-center gap-1.5 font-medium text-foreground truncate">
            <FolderGit2 className="size-3.5 text-primary shrink-0" />
            <span className="truncate">{project.repoName}</span>
            {primaryWorktree?.branch && (
              <span className="text-[11px] text-muted-foreground font-normal truncate">
                ({primaryWorktree.branch})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ActionButton
              icon={RefreshCw}
              title={translate(
                'auto.components.rightSidebar.lineageSourceControl.refresh',
                'Refresh'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onRefresh?.()
              }}
            />
          </div>
        </div>

        <div className="px-3 pt-2 pb-2 border-b border-border/20">
          <div className="relative">
            <textarea
              rows={3}
              value={commitMessage}
              disabled={isCommitting}
              onChange={handleMessageChange}
              placeholder={translate(
                'auto.components.rightSidebar.lineageSourceControl.commitPlaceholder',
                'Message (⌘Enter to commit on "{{branch}}")',
                {
                  branch: primaryWorktree?.branch || 'main'
                }
              )}
              aria-label={translate(
                'auto.components.rightSidebar.lineageSourceControl.commitMessageFor',
                'Commit message for {{repo}}',
                {
                  repo: project.repoName
                }
              )}
              data-testid={`commit-input-${project.repoName}`}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void handleCommit()
                }
              }}
              className="mt-0.5 min-h-14 w-full resize-none appearance-none rounded-md border border-input bg-background shadow-xs px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
            />
          </div>

          {commitError && (
            <div className="text-[11px] text-destructive mt-1 font-medium">{commitError}</div>
          )}
          {commitSuccess && (
            <div className="text-[11px] text-workspace-status-review mt-1 flex items-center gap-1 font-medium">
              <Check className="size-3" />{' '}
              {translate(
                'auto.components.rightSidebar.lineageSourceControl.committed',
                'Committed!'
              )}
            </div>
          )}

          <Button
            size="sm"
            className="w-full mt-2"
            disabled={!commitMessage.trim() || isCommitting}
            onClick={handleCommit}
            data-testid={`commit-button-${project.repoName}`}
          >
            <Check className="size-3.5" />
            {isCommitting
              ? translate(
                  'auto.components.rightSidebar.lineageSourceControl.committing',
                  'Committing...'
                )
              : translate(
                  'auto.components.rightSidebar.lineageSourceControl.commitTo',
                  'Commit to {{branch}}',
                  {
                    branch: primaryWorktree?.branch || 'main'
                  }
                )}
          </Button>
        </div>

        <ProjectSourceControlSectionGroup
          worktreePath={worktreePath}
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          untrackedFiles={untrackedFiles}
          onStageAll={handleStageAll}
          onUnstageAll={handleUnstageAll}
          onDiscardAll={handleDiscardAll}
          onStagePath={handleStagePath}
          onUnstagePath={handleUnstagePath}
          onDiscardEntry={handleDiscardEntry}
          onFileClick={handleFileClick}
          onRevealInExplorer={handleRevealInExplorer}
        />
      </div>
    </TooltipProvider>
  )
}

export default ProjectSourceControlScope
