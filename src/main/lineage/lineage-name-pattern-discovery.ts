import path from 'node:path'
import type { LineagePatternMatchOn } from '../../shared/lineage-discovery-types'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import { listWorktrees } from '../git/worktree'
import { matchesTicketKeys } from '../../shared/lineage-ticket-keys'

const BRANCH_REF_PREFIX = 'refs/heads/'

export type PatternRepo = {
  id: string
  path: string
  displayName: string
  connectionId?: string | null
}

export type PatternTarget = {
  repoId: string
  repoName: string
  worktreePath: string
  branch: string
  matchedOn: 'branch' | 'worktree-name'
  matchedKey: string
}

export type DiscoverPatternTargetsArgs = {
  repos: PatternRepo[]
  keys: string[]
  excludePaths?: string[]
  matchOn?: LineagePatternMatchOn
  /** 'all' or the repo ids that may be scanned. */
  repoScope?: 'all' | string[]
  listWorktreesFn?: (repoPath: string) => Promise<GitWorktreeInfo[]>
}

/** Finds worktrees (primary checkouts included) across local repos whose branch carries a ticket key. */
export async function discoverPatternTargets(
  args: DiscoverPatternTargetsArgs
): Promise<PatternTarget[]> {
  const {
    repos,
    keys,
    excludePaths = [],
    matchOn = 'branch',
    repoScope = 'all',
    listWorktreesFn = listWorktrees
  } = args
  if (keys.length === 0) {
    return []
  }

  // hazard: remote repos are skipped, their git must run on the execution host (SSH boundary)
  const localRepos = repos.filter(
    (repo) => !repo.connectionId && (repoScope === 'all' || repoScope.includes(repo.id))
  )
  const perRepo = await Promise.all(
    localRepos.map(
      async (
        repo
      ): Promise<{ repo: (typeof localRepos)[number]; worktrees: GitWorktreeInfo[] }> => {
        try {
          return { repo, worktrees: await listWorktreesFn(repo.path) }
        } catch {
          return { repo, worktrees: [] }
        }
      }
    )
  )

  const targets: PatternTarget[] = []
  for (const { repo, worktrees } of perRepo) {
    for (const worktree of worktrees) {
      if (worktree.isBare || excludePaths.includes(worktree.path)) {
        continue
      }
      const branch = worktree.branch.startsWith(BRANCH_REF_PREFIX)
        ? worktree.branch.slice(BRANCH_REF_PREFIX.length)
        : worktree.branch
      const candidates: { matchedOn: PatternTarget['matchedOn']; text: string }[] = []
      if (matchOn !== 'worktree-name') {
        candidates.push({ matchedOn: 'branch', text: branch })
      }
      if (matchOn !== 'branch') {
        candidates.push({ matchedOn: 'worktree-name', text: path.basename(worktree.path) })
      }
      for (const { matchedOn, text } of candidates) {
        const matchedKey = keys.find((key) => matchesTicketKeys(text, [key]))
        if (matchedKey) {
          targets.push({
            repoId: repo.id,
            repoName: repo.displayName,
            worktreePath: worktree.path,
            branch,
            matchedOn,
            matchedKey
          })
          break
        }
      }
    }
  }
  return targets
}
