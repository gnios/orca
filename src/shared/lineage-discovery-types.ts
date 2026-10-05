export type LineageMatchSource = 'lineage' | 'pattern' | 'manual'
export type LineagePatternMatchOn = 'branch' | 'worktree-name' | 'both'

export type LineageDiscoverySettings = {
  lineageEnabled: boolean
  patternEnabled: boolean
  /** Regex source that extracts keys from the tower workspace name. */
  keyRegex: string
  matchOn: LineagePatternMatchOn
  /** 'all' or the repo ids that pattern discovery may scan. */
  repoScope: 'all' | string[]
}

export const DEFAULT_KEY_REGEX = '[A-Za-z][A-Za-z0-9]{1,9}-\\d+'

export const DEFAULT_LINEAGE_DISCOVERY: LineageDiscoverySettings = {
  lineageEnabled: true,
  patternEnabled: true,
  keyRegex: DEFAULT_KEY_REGEX,
  matchOn: 'branch',
  repoScope: 'all'
}

export type ManualPullRequestLink = {
  id: string
  repoName: string
  number: number
  url?: string
  addedAt: number
}

export type LineageMemberPullRequest = { number: number; url?: string; title?: string }

export type LineageMember = {
  repoName: string
  branch: string
  /** Absent for a manual PR that has no local worktree. */
  worktreePath?: string
  worktreeId?: string
  matchedBy: LineageMatchSource
  reasons: string[]
  pr?: LineageMemberPullRequest
  manualLinkId?: string
}
