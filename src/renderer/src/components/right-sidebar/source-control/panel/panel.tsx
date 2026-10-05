import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { SourceControlPanelReady } from './panel-ready'
import { useSourceControlPanelModel } from './use-panel-model'
import { LineageSourceControl } from '../lineage/LineageSourceControl'
import { useLineageTicketKeys } from '../lineage/use-lineage-ticket-keys'

/** Resolves the panel model and guards the two states that have no source control to show. */
export function SourceControlPanel() {
  const model = useSourceControlPanelModel()
  const { activeRepo, activeWorktree, isFolder, worktreePath } = model
  const activeWorkspaceKey = useAppStore((s) => s.activeWorkspaceKey)
  const workspaceLineageByChildKey = useAppStore((s) => s.workspaceLineageByChildKey)

  const hasLineageChildren = Object.values(workspaceLineageByChildKey ?? {}).some(
    (lineage) => lineage.parentWorkspaceKey === activeWorkspaceKey
  )

  const ticketKeys = useLineageTicketKeys(activeWorkspaceKey)

  if (hasLineageChildren || ticketKeys.length > 0) {
    return <LineageSourceControl parentWorkspaceKey={activeWorkspaceKey ?? undefined} />
  }

  if (!activeWorktree || !activeRepo || !worktreePath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground px-4 text-center">
        {translate(
          'auto.components.right.sidebar.SourceControl.c07b236287',
          'Select a workspace to view changes'
        )}
      </div>
    )
  }
  if (isFolder) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground px-4 text-center">
        {translate(
          'auto.components.right.sidebar.SourceControl.e131cd7128',
          'Source Control is only available for Git repositories'
        )}
      </div>
    )
  }

  return (
    <SourceControlPanelReady
      activeRepo={activeRepo}
      activeWorktree={activeWorktree}
      currentWorktreeId={activeWorktree.id}
      model={model}
      worktreePath={worktreePath}
    />
  )
}
