import type { GitFileStatus, GitStatusEntry } from './git-status-types'
import type { WorkspaceLineage } from './worktree/lineage-types'

export interface LineageWorktreeStatus {
  worktreeId: string
  worktreePath: string
  branch: string
  dirtyFiles: GitStatusEntry[] | GitFileStatus[]
}

export interface LineageProjectStatus {
  repoName: string
  worktrees: LineageWorktreeStatus[]
}

export interface LineageGitStatusPayload {
  status?: number
  parentKey: string
  parentWorkspaceKey: string
  totalDirtyFiles: number
  projects: Record<string, LineageProjectStatus>
}

export interface AttachToParentArgs {
  parentWorkspaceKey: string
  childWorkspaceKey: string
}

export interface AttachToParentResult {
  status?: number
  success: boolean
  lineageEntry?: WorkspaceLineage
  error?: string
}

export interface NotifyWorktreeCreatedArgs {
  worktreePath: string
  repoName?: string
  branch?: string
  parentWorkspaceKey?: string
}

export interface NotifyWorktreeCreatedResult {
  status?: number
  registered: boolean
  lineageEntry?: WorkspaceLineage
  error?: string
}

export interface LineageCommitProjectArgs {
  worktreePath: string
  message: string
}

export interface LineageCommitProjectResult {
  status?: number
  success: boolean
  commitHash?: string
  error?: string
}

export interface LineageGetFileDiffArgs {
  childWorktreeId?: string
  worktreePath?: string
  filePath: string
  staged: boolean
}

export interface LineageGetFileDiffResult {
  status: 200 | 404 | 500
  patch: string
  original: string
  modified: string
  error?: string
}

export interface LineagePullRequestReviewer {
  name: string
  avatarUrl?: string
  status?: 'approved' | 'changes_requested' | 'commented' | 'pending'
}

export interface LineagePullRequest {
  id: string | number
  number: number
  title: string
  branch: string
  sourceBranch?: string
  repoName: string
  author?: string
  ciStatus?: 'success' | 'failure' | 'pending' | 'running' | 'passed' | 'neutral'
  reviewers?: (string | LineagePullRequestReviewer)[]
  url?: string
}

