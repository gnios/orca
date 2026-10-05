import React, { useContext, useState } from 'react'
import { Check, GitBranch, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { GitStagingArea, GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { LineageWorktreeStatus } from '../../../../../../shared/fleet-lineage-types'
import {
  readCommitDraftForWorktree,
  writeCommitDraftForWorktree,
  type CommitDraftsByWorktree
} from '../commit/commit-drafts'
import { ActionButton } from '../listing/action-button'
import { LineageOriginBadge } from '../../lineage-origin-badge'
import { groupLineageDirtyEntries } from './lineage-dirty-entries'
import {
  ProjectSourceControlSectionGroup,
  type LineageBulkAction
} from './ProjectSourceControlSectionGroup'
import { translate } from '@/i18n/i18n'

// why: draft persistence across unmounts requires a module-level cache across worktrees
const globalLineageCommitDrafts: CommitDraftsByWorktree = {}

export function resetLineageCommitDrafts(): void {
  for (const key of Object.keys(globalLineageCommitDrafts)) {
    delete globalLineageCommitDrafts[key]
  }
}

export type WorktreeSourceControlScopeProps = {
  repoName: string
  worktree: LineageWorktreeStatus
  onRefresh?: () => void
  onOpenFileDiff?: (worktreeId: string, filePath: string, staged: boolean) => void
}

/** invariant: every action here targets this worktree's path, never a sibling worktree of the same repo. */
export function WorktreeSourceControlScope({
  repoName,
  worktree,
  onRefresh,
  onOpenFileDiff
}: WorktreeSourceControlScopeProps): React.JSX.Element {
  const storeOpenDiff = useAppStore((s) => s.openDiff)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const confirm = useContext(ConfirmationDialogContext)
  const { worktreeId, worktreePath, branch } = worktree
  const groups = groupLineageDirtyEntries(worktree)

  const [drafts, setDrafts] = useState<CommitDraftsByWorktree>(globalLineageCommitDrafts)
  const commitMessage = readCommitDraftForWorktree(drafts, worktreeId)
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitSuccess, setCommitSuccess] = useState(false)

  const writeDraft = (value: string): void => {
    globalLineageCommitDrafts[worktreeId] = value
    setDrafts(writeCommitDraftForWorktree(drafts, worktreeId, value))
  }

  const runAndRefresh = async (label: string, action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      onRefresh?.()
    } catch (error) {
      console.error(`Failed to ${label}`, error)
    }
  }

  const handleBulkAction = async (
    action: LineageBulkAction,
    area: GitStagingArea,
    filePaths: string[]
  ): Promise<void> => {
    if (filePaths.length === 0) {
      return
    }
    if (action === 'discard' && confirm) {
      const confirmed = await confirm({
        title: translate(
          'auto.components.rightSidebar.lineageSourceControl.discardAllTitle',
          'Discard {{count}} files on {{branch}}?',
          { count: filePaths.length, branch }
        ),
        description: translate(
          'auto.components.rightSidebar.lineageSourceControl.discardAllDescription',
          'This cannot be undone.'
        ),
        confirmLabel: translate(
          'auto.components.rightSidebar.lineageSourceControl.discardAllConfirm',
          'Discard'
        ),
        confirmVariant: 'destructive'
      })
      if (!confirmed) {
        return
      }
    }
    const api = window.api.git
    await runAndRefresh(`${action} ${area} files`, () =>
      action === 'stage'
        ? api.bulkStage({ worktreePath, filePaths })
        : action === 'unstage'
          ? api.bulkUnstage({ worktreePath, filePaths })
          : api.bulkDiscard({ worktreePath, filePaths })
    )
  }

  const handleStagePath = (filePath: string): Promise<void> =>
    runAndRefresh('stage file', () => window.api.git.stage({ worktreePath, filePath }))
  const handleUnstagePath = (filePath: string): Promise<void> =>
    runAndRefresh('unstage file', () => window.api.git.unstage({ worktreePath, filePath }))
  const handleDiscardEntry = (entry: GitStatusEntry): Promise<void> =>
    runAndRefresh('discard file', () =>
      window.api.git.discard({ worktreePath, filePath: entry.path })
    )

  const handleRevealInExplorer = (targetWorktreeId: string, absPath: string): void => {
    useAppStore.getState().revealInExplorer?.(targetWorktreeId, absPath)
  }

  const handleCommit = async (): Promise<void> => {
    const trimmed = commitMessage.trim()
    if (!trimmed) {
      return
    }
    setIsCommitting(true)
    setCommitError(null)
    setCommitSuccess(false)
    try {
      const result = await window.api.git.lineageCommitProject({ worktreePath, message: trimmed })
      if (result.status === 400 || result.status === 500 || result.success === false) {
        setCommitError(result.error ?? 'Commit failed')
        return
      }
      writeDraft('')
      setCommitSuccess(true)
      setTimeout(() => setCommitSuccess(false), 2000)
      onRefresh?.()
    } catch (err: unknown) {
      setCommitError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleFileClick = (targetWorktreeId: string, filePath: string, staged: boolean): void => {
    if (onOpenFileDiff) {
      onOpenFileDiff(targetWorktreeId, filePath, staged)
      return
    }
    // invariant: a diff tab only opens for a worktree the store owns, never an orphan id
    if (!worktreePath || !findWorktreeById(worktreesByRepo ?? {}, targetWorktreeId)) {
      return
    }
    storeOpenDiff?.(
      targetWorktreeId,
      joinPath(worktreePath, filePath),
      filePath,
      detectLanguage(filePath),
      staged
    )
  }

  const branchLabel = branch || 'main'

  return (
    <div className="flex flex-col text-xs" data-testid={`worktree-scope-${worktreeId}`}>
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 border-b border-border/20">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate" title={worktreePath}>
            {branchLabel}
          </span>
          <LineageOriginBadge matchedBy={worktree.matchedBy} reasons={worktree.reason} />
          {worktree.unverifiable && (
            <span
              className="shrink-0 text-[11px] font-normal text-muted-foreground"
              data-testid="worktree-unverifiable"
            >
              {translate(
                'auto.components.rightSidebar.lineageSourceControl.unverifiable',
                'unverifiable'
              )}
            </span>
          )}
        </div>
        <ActionButton
          icon={RefreshCw}
          title={translate('auto.components.rightSidebar.lineageSourceControl.refresh', 'Refresh')}
          onClick={(e) => {
            e.stopPropagation()
            onRefresh?.()
          }}
        />
      </div>

      {!worktree.unverifiable && (
        <div className="px-3 pt-2 pb-2 border-b border-border/20">
          <textarea
            rows={3}
            value={commitMessage}
            disabled={isCommitting}
            onChange={(e) => writeDraft(e.target.value)}
            placeholder={translate(
              'auto.components.rightSidebar.lineageSourceControl.commitPlaceholder',
              'Message (⌘Enter to commit on "{{branch}}")',
              { branch: branchLabel }
            )}
            aria-label={translate(
              'auto.components.rightSidebar.lineageSourceControl.commitMessageFor',
              'Commit message for {{repo}}',
              { repo: `${repoName} (${branchLabel})` }
            )}
            data-testid={`commit-input-${worktreeId}`}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void handleCommit()
              }
            }}
            className="mt-0.5 min-h-14 w-full resize-none appearance-none rounded-md border border-input bg-background shadow-xs px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
          />
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
            data-testid={`commit-button-${worktreeId}`}
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
                  { branch: branchLabel }
                )}
          </Button>
        </div>
      )}

      {!worktree.unverifiable && (
        <ProjectSourceControlSectionGroup
          worktreeId={worktreeId}
          worktreePath={worktreePath}
          groups={groups}
          onBulkAction={handleBulkAction}
          onStagePath={handleStagePath}
          onUnstagePath={handleUnstagePath}
          onDiscardEntry={handleDiscardEntry}
          onFileClick={handleFileClick}
          onRevealInExplorer={handleRevealInExplorer}
        />
      )}
    </div>
  )
}
