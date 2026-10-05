import type { GitFileStatus, GitStatusEntry } from './git-status-types'
import type { WorkspaceLineage } from './worktree/lineage-types'
import type {
  LineageMatchSource,
  LineageMember,
  ManualPullRequestLink
} from './lineage-discovery-types'

export type LineageWorktreeStatus = {
  worktreeId: string
  worktreePath: string
  branch: string
  dirtyFiles: GitStatusEntry[] | GitFileStatus[]
  /** Absent on payloads from older hosts; treat as 'lineage'. */
  matchedBy?: LineageMatchSource
  /** Why the worktree was included; absent on payloads from older hosts. */
  reason?: string[]
}

export type LineageProjectStatus = {
  repoName: string
  worktrees: LineageWorktreeStatus[]
  totalDirtyFiles?: number
}

export type LineageGitStatusArgs = {
  parentWorkspaceKey: string
  /** Ticket keys (e.g. LEVGP-483) from the workspace name; absent = derive from the key. */
  ticketKeys?: string[]
}

export type LineageGitStatusPayload = {
  status?: number
  parentKey: string
  parentWorkspaceKey: string
  totalDirtyFiles: number
  projects: Record<string, LineageProjectStatus>
}

export type AttachToParentArgs = {
  parentWorkspaceKey: string
  childWorkspaceKey: string
}

export type AttachToParentResult = {
  status?: number
  success: boolean
  lineageEntry?: WorkspaceLineage
  error?: string
}

export type NotifyWorktreeCreatedArgs = {
  worktreePath: string
  repoName?: string
  branch?: string
  parentWorkspaceKey?: string
}

export type NotifyWorktreeCreatedResult = {
  status?: number
  registered: boolean
  lineageEntry?: WorkspaceLineage
  error?: string
}

export type LineageCommitProjectArgs = {
  worktreePath: string
  message: string
}

export type LineageCommitProjectResult = {
  status?: number
  success: boolean
  commitHash?: string
  error?: string
}

export type LineageGetFileDiffArgs = {
  childWorktreeId?: string
  worktreePath?: string
  filePath: string
  staged: boolean
}

export type LineageGetFileDiffResult = {
  status: 200 | 404 | 500
  patch: string
  original: string
  modified: string
  error?: string
}

export type LineagePullRequestReviewer = {
  name: string
  avatarUrl?: string
  status?: 'approved' | 'changes_requested' | 'commented' | 'pending'
}

export type LineagePullRequest = {
  id?: string | number
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

export type LineageGetMembersArgs = { parentWorkspaceKey: string }

export type LineageGetMembersResult = {
  status?: number
  parentWorkspaceKey: string
  keys: string[]
  members: LineageMember[]
  patternError?: string
}

export type LineageAddManualLinkArgs = { parentWorkspaceKey: string; reference: string }

export type LineageAddManualLinkResult = {
  success: boolean
  error?: string
  link?: ManualPullRequestLink
}

export type LineageRemoveManualLinkArgs = { parentWorkspaceKey: string; linkId: string }

export type LineageRemoveManualLinkResult = {
  success: boolean
}

export type LineageTestPatternArgs = { towerName: string; keyRegex: string }

export type LineageTestPatternResult = {
  keys: string[]
  error?: string
}
