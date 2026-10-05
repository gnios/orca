import type {
  GitFileStatus,
  GitStagingArea,
  GitStatusEntry
} from '../../../../../../shared/git-status-types'
import type { LineageWorktreeStatus } from '../../../../../../shared/fleet-lineage-types'

function normalizeGitStatus(status?: string): GitFileStatus {
  switch (status) {
    case 'A':
    case 'added':
      return 'added'
    case 'D':
    case 'deleted':
      return 'deleted'
    case 'R':
    case 'renamed':
      return 'renamed'
    case 'U':
    case 'untracked':
      return 'untracked'
    case 'C':
    case 'copied':
      return 'copied'
    case undefined:
    default:
      return 'modified'
  }
}

function normalizeGitArea(area?: string): GitStagingArea {
  if (area === 'staged' || area === 'untracked') {
    return area
  }
  return 'unstaged'
}

export type LineageDirtyEntryGroups = Record<GitStagingArea, GitStatusEntry[]>

/** Normalizes one worktree's dirty files (older hosts send loose shapes) and splits them by area. */
export function groupLineageDirtyEntries(worktree: LineageWorktreeStatus): LineageDirtyEntryGroups {
  const groups: LineageDirtyEntryGroups = { staged: [], unstaged: [], untracked: [] }
  for (const item of worktree.dirtyFiles ?? []) {
    const entry: GitStatusEntry =
      typeof item === 'string'
        ? { path: item, status: 'modified', area: 'unstaged' }
        : {
            path: item.path,
            status: normalizeGitStatus(item.status),
            area: normalizeGitArea(item.area)
          }
    groups[entry.area].push(entry)
  }
  return groups
}
