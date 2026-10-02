import React, { useState, useEffect, useCallback } from 'react'
import {
  FolderGit2,
  RefreshCw,
  Plus,
  Minus,
  Trash2,
  GitCommit,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { LineageProjectStatus } from '../../../../../../shared/fleet-lineage-types'
import {
  readCommitDraftForWorktree,
  writeCommitDraftForWorktree,
  type CommitDraftsByWorktree
} from '../commit/commit-drafts'

// In-memory module cache for commit drafts across worktrees to ensure draft persistence across unmounts
const globalLineageCommitDrafts: CommitDraftsByWorktree = {}

export function resetLineageCommitDrafts(): void {
  for (const key of Object.keys(globalLineageCommitDrafts)) {
    delete globalLineageCommitDrafts[key]
  }
}

export interface ProjectSourceControlScopeProps {
  project: LineageProjectStatus & {
    worktreePath?: string
    totalDirtyFiles?: number
  }
  onRefresh?: () => void
  onOpenFileDiff?: (worktreeId: string, filePath: string, staged: boolean) => void
}

export function ProjectSourceControlScope({
  project,
  onRefresh,
  onOpenFileDiff
}: ProjectSourceControlScopeProps): React.JSX.Element {
  const storeOpenDiff = useAppStore((s) => s.openDiff)

  // Primary worktree for this project
  const primaryWorktree = project.worktrees[0]
  const worktreeId = primaryWorktree?.worktreeId ?? project.repoName
  const worktreePath = project.worktreePath ?? primaryWorktree?.worktreePath ?? ''

  // Commit draft state persisted by worktreeId
  const [drafts, setDrafts] = useState<CommitDraftsByWorktree>(globalLineageCommitDrafts)
  const commitMessage = readCommitDraftForWorktree(drafts, worktreeId)

  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitSuccess, setCommitSuccess] = useState(false)

  // Section collapse state
  const [isStagedOpen, setIsStagedOpen] = useState(true)
  const [isChangesOpen, setIsChangesOpen] = useState(true)

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const next = writeCommitDraftForWorktree(drafts, worktreeId, val)
    globalLineageCommitDrafts[worktreeId] = val
    setDrafts(next)
  }

  // Combine dirty files across all child worktrees in this project
  const allDirtyFiles: Array<{ worktreeId: string; entry: GitStatusEntry }> = []
  for (const wt of project.worktrees) {
    if (wt.dirtyFiles && Array.isArray(wt.dirtyFiles)) {
      for (const f of wt.dirtyFiles) {
        allDirtyFiles.push({ worktreeId: wt.worktreeId, entry: f as GitStatusEntry })
      }
    }
  }

  const stagedFiles = allDirtyFiles.filter((item) => item.entry.area === 'staged')
  const unstagedFiles = allDirtyFiles.filter((item) => item.entry.area !== 'staged')

  // Actions
  const handleStageAll = async () => {
    try {
      if ((window as any).api?.git?.stageAll) {
        await (window as any).api.git.stageAll({ worktreePath })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        await (window as any).electron.ipcRenderer.invoke('git:stageAll', { worktreePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to stage all', e)
    }
  }

  const handleUnstageAll = async () => {
    try {
      if ((window as any).api?.git?.unstageAll) {
        await (window as any).api.git.unstageAll({ worktreePath })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        await (window as any).electron.ipcRenderer.invoke('git:unstageAll', { worktreePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to unstage all', e)
    }
  }

  const handleDiscardAll = async () => {
    try {
      if ((window as any).api?.git?.discardAll) {
        await (window as any).api.git.discardAll({ worktreePath })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        await (window as any).electron.ipcRenderer.invoke('git:discardAll', { worktreePath })
      }
      onRefresh?.()
    } catch (e) {
      console.error('Failed to discard all', e)
    }
  }

  const handleCommit = async () => {
    const trimmed = commitMessage.trim()
    if (!trimmed) return

    setIsCommitting(true)
    setCommitError(null)
    setCommitSuccess(false)

    try {
      let result: any
      if ((window as any).api?.git?.lineageCommitProject) {
        result = await (window as any).api.git.lineageCommitProject({
          worktreePath,
          message: trimmed
        })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        result = await (window as any).electron.ipcRenderer.invoke('git:lineage-commit-project', {
          worktreePath,
          message: trimmed
        })
      }

      if (result && (result.status === 400 || result.status === 500 || result.success === false)) {
        setCommitError(result.error ?? 'Commit failed')
        return
      }

      // Success: clear commit draft for this worktree
      const next = writeCommitDraftForWorktree(drafts, worktreeId, '')
      globalLineageCommitDrafts[worktreeId] = ''
      setDrafts(next)
      setCommitSuccess(true)
      setTimeout(() => setCommitSuccess(false), 2000)
      onRefresh?.()
    } catch (err: any) {
      setCommitError(err?.message ?? 'Commit failed')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleFileClick = (targetWorktreeId: string, filePath: string, staged: boolean) => {
    if (onOpenFileDiff) {
      onOpenFileDiff(targetWorktreeId, filePath, staged)
      return
    }
    if (storeOpenDiff) {
      storeOpenDiff(targetWorktreeId, filePath, filePath, 'text', staged)
    }
  }

  return (
    <div
      className="flex flex-col gap-3 p-3 bg-muted/20 border-t border-border/50 text-xs"
      data-testid={`project-scope-${project.repoName}`}
    >
      {/* Project Action Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/30">
        <div className="flex items-center gap-1.5 font-medium text-foreground truncate">
          <FolderGit2 className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">{project.repoName}</span>
          {primaryWorktree?.branch && (
            <span className="text-[11px] text-muted-foreground font-normal">
              ({primaryWorktree.branch})
            </span>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleStageAll}
            title="Stage All"
            aria-label="Stage All"
          >
            <Plus className="h-3.5 w-3.5 mr-1 text-green-500" />
            Stage All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleUnstageAll}
            title="Unstage All"
            aria-label="Unstage All"
          >
            <Minus className="h-3.5 w-3.5 mr-1 text-amber-500" />
            Unstage All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleDiscardAll}
            title="Discard All"
            aria-label="Discard All"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1 text-red-500" />
            Discard All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onRefresh}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Staged Changes Section */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="flex items-center justify-between text-muted-foreground hover:text-foreground text-left py-1"
          onClick={() => setIsStagedOpen(!isStagedOpen)}
        >
          <div className="flex items-center gap-1">
            {isStagedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-medium">Staged Changes</span>
          </div>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {stagedFiles.length}
          </Badge>
        </button>

        {isStagedOpen && (
          <div className="flex flex-col gap-0.5 pl-3">
            {stagedFiles.length === 0 ? (
              <div className="text-[11px] text-muted-foreground py-1 italic">No staged changes</div>
            ) : (
              stagedFiles.map(({ worktreeId: fileWtId, entry }, idx) => (
                <div
                  key={`${entry.path}-${idx}`}
                  role="button"
                  tabIndex={0}
                  className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/50 cursor-pointer group"
                  onClick={() => handleFileClick(fileWtId, entry.path, true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleFileClick(fileWtId, entry.path, true)
                    }
                  }}
                  data-testid={`file-row-${entry.path}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{entry.path}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-green-500 border-green-500/30">
                    {entry.status || 'M'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Changes Section */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="flex items-center justify-between text-muted-foreground hover:text-foreground text-left py-1"
          onClick={() => setIsChangesOpen(!isChangesOpen)}
        >
          <div className="flex items-center gap-1">
            {isChangesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-medium">Changes</span>
          </div>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {unstagedFiles.length}
          </Badge>
        </button>

        {isChangesOpen && (
          <div className="flex flex-col gap-0.5 pl-3">
            {unstagedFiles.length === 0 ? (
              <div className="text-[11px] text-muted-foreground py-1 italic">No unstaged changes</div>
            ) : (
              unstagedFiles.map(({ worktreeId: fileWtId, entry }, idx) => (
                <div
                  key={`${entry.path}-${idx}`}
                  role="button"
                  tabIndex={0}
                  className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/50 cursor-pointer group"
                  onClick={() => handleFileClick(fileWtId, entry.path, false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleFileClick(fileWtId, entry.path, false)
                    }
                  }}
                  data-testid={`file-row-${entry.path}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{entry.path}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-500 border-amber-500/30">
                    {entry.status || 'M'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Dedicated Commit Area */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
        <Textarea
          placeholder={`Commit message for ${project.repoName}...`}
          value={commitMessage}
          onChange={handleMessageChange}
          rows={2}
          className="text-xs resize-none"
          aria-label={`Commit message for ${project.repoName}`}
          data-testid={`commit-input-${project.repoName}`}
        />

        {commitError && (
          <div className="text-[11px] text-red-500 px-1">{commitError}</div>
        )}

        <div className="flex items-center justify-between gap-2">
          {commitSuccess ? (
            <span className="text-[11px] text-green-500 flex items-center gap-1">
              <Check className="h-3 w-3" /> Committed!
            </span>
          ) : (
            <span />
          )}

          <Button
            size="sm"
            className="h-7 px-3 text-xs ml-auto"
            disabled={!commitMessage.trim() || isCommitting}
            onClick={handleCommit}
            data-testid={`commit-button-${project.repoName}`}
          >
            <GitCommit className="h-3.5 w-3.5 mr-1" />
            {isCommitting ? 'Committing...' : 'Commit'}
          </Button>
        </div>
      </div>
    </div>
  )
}
export default ProjectSourceControlScope
