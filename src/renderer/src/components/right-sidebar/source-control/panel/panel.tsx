import { translate } from '@/i18n/i18n'
import { SourceControlPanelReady } from './panel-ready'
import { useSourceControlPanelModel } from './use-panel-model'
import { LineageSourceControl } from '../lineage/LineageSourceControl'
import { useLineageTowerRouting } from '../../lineage-members/use-lineage-tower-routing'

/** Resolves the panel model and guards the two states that have no source control to show. */
export function SourceControlPanel() {
  const model = useSourceControlPanelModel()
  const { activeRepo, activeWorktree, isFolder, worktreePath } = model
  const { towerKey, showLineage } = useLineageTowerRouting()

  // why: until members load (or on hosts without lineage) the standard panel renders, so there is no flash
  if (showLineage && towerKey) {
    return <LineageSourceControl parentWorkspaceKey={towerKey} />
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
