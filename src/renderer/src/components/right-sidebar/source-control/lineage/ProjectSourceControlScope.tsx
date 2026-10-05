import React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { LineageProjectStatus } from '../../../../../../shared/fleet-lineage-types'
import { WorktreeSourceControlScope } from './WorktreeSourceControlScope'

export { resetLineageCommitDrafts } from './WorktreeSourceControlScope'

export type ProjectSourceControlScopeProps = {
  project: LineageProjectStatus
  onRefresh?: () => void
  onOpenFileDiff?: (worktreeId: string, filePath: string, staged: boolean) => void
}

/** One repository section body: a sub-scope per worktree, each with its own actions and commit box. */
export function ProjectSourceControlScope({
  project,
  onRefresh,
  onOpenFileDiff
}: ProjectSourceControlScopeProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <div
        className="flex flex-col divide-y divide-border/40 border-t border-border/40"
        data-testid={`project-scope-${project.repoName}`}
      >
        {project.worktrees.map((worktree) => (
          <WorktreeSourceControlScope
            key={worktree.worktreeId}
            repoName={project.repoName}
            worktree={worktree}
            onRefresh={onRefresh}
            onOpenFileDiff={onOpenFileDiff}
          />
        ))}
      </div>
    </TooltipProvider>
  )
}

export default ProjectSourceControlScope
