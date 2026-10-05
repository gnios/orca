import React, { useState } from 'react'
import { Plus, Minus, Undo2 } from 'lucide-react'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { SectionHeader } from '../listing/section-header'
import { ActionButton } from '../listing/action-button'
import { UncommittedEntryRow } from '../listing/uncommitted-entry-row'
import { translate } from '@/i18n/i18n'

export type ProjectSourceControlSectionGroupProps = {
  worktreePath: string
  stagedFiles: { worktreeId: string; entry: GitStatusEntry }[]
  unstagedFiles: { worktreeId: string; entry: GitStatusEntry }[]
  untrackedFiles: { worktreeId: string; entry: GitStatusEntry }[]
  onStageAll: () => Promise<void>
  onUnstageAll: () => Promise<void>
  onDiscardAll: () => Promise<void>
  onStagePath: (path: string) => Promise<void>
  onUnstagePath: (path: string) => Promise<void>
  onDiscardEntry: (entry: GitStatusEntry) => Promise<void>
  onFileClick: (worktreeId: string, filePath: string, staged: boolean) => void
  onRevealInExplorer: (worktreeId: string, filePath: string) => void
}

export function ProjectSourceControlSectionGroup({
  worktreePath,
  stagedFiles,
  unstagedFiles,
  untrackedFiles,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  onStagePath,
  onUnstagePath,
  onDiscardEntry,
  onFileClick,
  onRevealInExplorer
}: ProjectSourceControlSectionGroupProps): React.JSX.Element {
  const [isStagedOpen, setIsStagedOpen] = useState(true)
  const [isChangesOpen, setIsChangesOpen] = useState(true)
  const [isUntrackedOpen, setIsUntrackedOpen] = useState(true)

  const hasAnyFiles =
    stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0

  return (
    <div className="flex flex-col">
      {stagedFiles.length > 0 && (
        <div className="flex flex-col">
          <SectionHeader
            label={translate(
              'auto.components.rightSidebar.lineageSourceControl.stagedChanges',
              'Staged Changes'
            )}
            count={stagedFiles.length}
            isCollapsed={!isStagedOpen}
            onToggle={() => setIsStagedOpen(!isStagedOpen)}
            actions={
              <ActionButton
                icon={Minus}
                title={translate(
                  'auto.components.rightSidebar.lineageSourceControl.unstageAll',
                  'Unstage All'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  void onUnstageAll()
                }}
              />
            }
          />
          {isStagedOpen && (
            <div className="flex flex-col">
              {stagedFiles.map(({ worktreeId: fileWtId, entry }) => (
                <div
                  key={`${fileWtId}:staged:${entry.path}`}
                  data-testid={`file-row-${entry.path}`}
                  onClick={(e) => {
                    // why: support direct DOM event targets in test runners
                    if (e.target === e.currentTarget) {
                      onFileClick(fileWtId, entry.path, true)
                    }
                  }}
                >
                  <UncommittedEntryRow
                    entryKey={`staged:${entry.path}`}
                    entry={entry}
                    currentWorktreeId={fileWtId}
                    worktreePath={worktreePath}
                    onOpen={() => onFileClick(fileWtId, entry.path, true)}
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
      )}

      {unstagedFiles.length > 0 && (
        <div className="flex flex-col">
          <SectionHeader
            label={translate(
              'auto.components.rightSidebar.lineageSourceControl.changes',
              'Changes'
            )}
            count={unstagedFiles.length}
            isCollapsed={!isChangesOpen}
            onToggle={() => setIsChangesOpen(!isChangesOpen)}
            actions={
              <>
                <ActionButton
                  icon={Undo2}
                  title={translate(
                    'auto.components.rightSidebar.lineageSourceControl.discardAll',
                    'Discard All'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onDiscardAll()
                  }}
                />
                <ActionButton
                  icon={Plus}
                  title={translate(
                    'auto.components.rightSidebar.lineageSourceControl.stageAll',
                    'Stage All'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onStageAll()
                  }}
                />
              </>
            }
          />
          {isChangesOpen && (
            <div className="flex flex-col">
              {unstagedFiles.map(({ worktreeId: fileWtId, entry }) => (
                <div
                  key={`${fileWtId}:unstaged:${entry.path}`}
                  data-testid={`file-row-${entry.path}`}
                  onClick={(e) => {
                    // why: support direct DOM event targets in test runners
                    if (e.target === e.currentTarget) {
                      onFileClick(fileWtId, entry.path, false)
                    }
                  }}
                >
                  <UncommittedEntryRow
                    entryKey={`unstaged:${entry.path}`}
                    entry={entry}
                    currentWorktreeId={fileWtId}
                    worktreePath={worktreePath}
                    onOpen={() => onFileClick(fileWtId, entry.path, false)}
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
      )}

      {untrackedFiles.length > 0 && (
        <div className="flex flex-col">
          <SectionHeader
            label={translate(
              'auto.components.rightSidebar.lineageSourceControl.untrackedFiles',
              'Untracked Files'
            )}
            count={untrackedFiles.length}
            isCollapsed={!isUntrackedOpen}
            onToggle={() => setIsUntrackedOpen(!isUntrackedOpen)}
            actions={
              <ActionButton
                icon={Plus}
                title={translate(
                  'auto.components.rightSidebar.lineageSourceControl.stageAll',
                  'Stage All'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  void onStageAll()
                }}
              />
            }
          />
          {isUntrackedOpen && (
            <div className="flex flex-col">
              {untrackedFiles.map(({ worktreeId: fileWtId, entry }) => (
                <div
                  key={`${fileWtId}:untracked:${entry.path}`}
                  data-testid={`file-row-${entry.path}`}
                  onClick={(e) => {
                    // why: support direct DOM event targets in test runners
                    if (e.target === e.currentTarget) {
                      onFileClick(fileWtId, entry.path, false)
                    }
                  }}
                >
                  <UncommittedEntryRow
                    entryKey={`untracked:${entry.path}`}
                    entry={entry}
                    currentWorktreeId={fileWtId}
                    worktreePath={worktreePath}
                    onOpen={() => onFileClick(fileWtId, entry.path, false)}
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
      )}

      {!hasAnyFiles && (
        <div className="py-2.5 px-3 text-[11px] text-muted-foreground/70 italic">
          {translate(
            'auto.components.rightSidebar.lineageSourceControl.repoClean',
            'No changes in this repository'
          )}
        </div>
      )}
    </div>
  )
}
