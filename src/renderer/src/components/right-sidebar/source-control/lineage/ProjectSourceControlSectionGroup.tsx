import React, { useState } from 'react'
import { Plus, Minus, Undo2 } from 'lucide-react'
import type { GitStagingArea, GitStatusEntry } from '../../../../../../shared/git-status-types'
import { SectionHeader } from '../listing/section-header'
import { ActionButton } from '../listing/action-button'
import { UncommittedEntryRow } from '../listing/uncommitted-entry-row'
import { translate } from '@/i18n/i18n'
import type { LineageDirtyEntryGroups } from './lineage-dirty-entries'

export type LineageBulkAction = 'stage' | 'unstage' | 'discard'

export type ProjectSourceControlSectionGroupProps = {
  worktreeId: string
  worktreePath: string
  groups: LineageDirtyEntryGroups
  /** invariant: always called with the paths of the clicked section only */
  onBulkAction: (action: LineageBulkAction, area: GitStagingArea, paths: string[]) => Promise<void>
  onStagePath: (path: string) => Promise<void>
  onUnstagePath: (path: string) => Promise<void>
  onDiscardEntry: (entry: GitStatusEntry) => Promise<void>
  onFileClick: (worktreeId: string, filePath: string, staged: boolean) => void
  onRevealInExplorer: (worktreeId: string, filePath: string) => void
}

type SectionSpec = {
  area: GitStagingArea
  label: string
  actions: { action: LineageBulkAction; icon: typeof Plus; title: string }[]
}

function sectionSpecs(): SectionSpec[] {
  const stageAll = translate(
    'auto.components.rightSidebar.lineageSourceControl.stageAll',
    'Stage All'
  )
  const discardAll = translate(
    'auto.components.rightSidebar.lineageSourceControl.discardAll',
    'Discard All'
  )
  return [
    {
      area: 'staged',
      label: translate(
        'auto.components.rightSidebar.lineageSourceControl.stagedChanges',
        'Staged Changes'
      ),
      actions: [
        {
          action: 'unstage',
          icon: Minus,
          title: translate(
            'auto.components.rightSidebar.lineageSourceControl.unstageAll',
            'Unstage All'
          )
        }
      ]
    },
    {
      area: 'unstaged',
      label: translate('auto.components.rightSidebar.lineageSourceControl.changes', 'Changes'),
      actions: [
        { action: 'discard', icon: Undo2, title: discardAll },
        { action: 'stage', icon: Plus, title: stageAll }
      ]
    },
    {
      area: 'untracked',
      label: translate(
        'auto.components.rightSidebar.lineageSourceControl.untrackedFiles',
        'Untracked Files'
      ),
      actions: [
        { action: 'discard', icon: Undo2, title: discardAll },
        { action: 'stage', icon: Plus, title: stageAll }
      ]
    }
  ]
}

export function ProjectSourceControlSectionGroup({
  worktreeId,
  worktreePath,
  groups,
  onBulkAction,
  onStagePath,
  onUnstagePath,
  onDiscardEntry,
  onFileClick,
  onRevealInExplorer
}: ProjectSourceControlSectionGroupProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Record<GitStagingArea, boolean>>({
    staged: false,
    unstaged: false,
    untracked: false
  })
  const hasAnyFiles =
    groups.staged.length > 0 || groups.unstaged.length > 0 || groups.untracked.length > 0

  return (
    <div className="flex flex-col">
      {sectionSpecs().map(({ area, label, actions }) => {
        const entries = groups[area]
        if (entries.length === 0) {
          return null
        }
        const isCollapsed = collapsed[area]
        const staged = area === 'staged'
        return (
          <div key={area} className="flex flex-col">
            <SectionHeader
              label={label}
              count={entries.length}
              isCollapsed={isCollapsed}
              onToggle={() => setCollapsed((prev) => ({ ...prev, [area]: !prev[area] }))}
              actions={actions.map(({ action, icon, title }) => (
                <ActionButton
                  key={action}
                  icon={icon}
                  title={title}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onBulkAction(
                      action,
                      area,
                      entries.map((entry) => entry.path)
                    )
                  }}
                />
              ))}
            />
            {!isCollapsed && (
              <div className="flex flex-col">
                {entries.map((entry) => (
                  <div
                    key={`${area}:${entry.path}`}
                    data-testid={`file-row-${entry.path}`}
                    onClick={(e) => {
                      // why: support direct DOM event targets in test runners
                      if (e.target === e.currentTarget) {
                        onFileClick(worktreeId, entry.path, staged)
                      }
                    }}
                  >
                    <UncommittedEntryRow
                      entryKey={`${area}:${entry.path}`}
                      entry={entry}
                      currentWorktreeId={worktreeId}
                      worktreePath={worktreePath}
                      onOpen={() => onFileClick(worktreeId, entry.path, staged)}
                      onStage={onStagePath}
                      onUnstage={onUnstagePath}
                      onDiscard={onDiscardEntry}
                      onRevealInExplorer={onRevealInExplorer}
                      commentCount={0}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {!hasAnyFiles && (
        <div className="py-2.5 px-3 text-[11px] text-muted-foreground/70 italic">
          {translate(
            'auto.components.rightSidebar.lineageSourceControl.worktreeClean',
            'No changes in this worktree'
          )}
        </div>
      )}
    </div>
  )
}
