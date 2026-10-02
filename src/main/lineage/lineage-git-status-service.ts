import fs from 'node:fs'
import path from 'node:path'
import type { GitStatusResult } from '../../shared/git-status-types'
import type {
  LineageGitStatusPayload,
  LineageProjectStatus,
  LineageWorktreeStatus,
  LineageCommitProjectArgs,
  LineageCommitProjectResult
} from '../../shared/fleet-lineage-types'
import { splitWorktreeId } from '../../shared/worktree/id'
import { getStatus, commitChanges } from '../git/status'
import { gitExecFileAsync } from '../git/runner'
import { gitOptionsForWorktree } from '../git/git-runtime-options'
import { getDefaultWorkspacesRoot } from './workspaces-fs-watcher'
import type { LineageStoreContract } from './workspace-lineage-service'
export { getLineageFileDiff } from '../git/lineage-git-diff'

export interface GetLineageStatusOptions {
  concurrencyLimit?: number
  gitStatusFn?: (worktreePath: string) => Promise<GitStatusResult>
  worktreePathResolver?: (worktreeId: string, repoName: string, branch: string) => string | null
}

export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let currentIndex = 0
  let activeWorkers = 0

  return new Promise((resolve, reject) => {
    if (items.length === 0) {
      resolve([])
      return
    }

    const next = () => {
      if (currentIndex >= items.length && activeWorkers === 0) {
        resolve(results)
        return
      }

      while (activeWorkers < limit && currentIndex < items.length) {
        const itemIndex = currentIndex++
        activeWorkers++
        fn(items[itemIndex])
          .then((result) => {
            results[itemIndex] = result
            activeWorkers--
            next()
          })
          .catch((err) => {
            reject(err)
          })
      }
    }

    next()
  })
}

export interface ResolvedWorktreeTarget {
  worktreeId: string
  repoName: string
  branchHint: string
  worktreePath: string
}

export function resolveWorktreeTarget(
  childWorkspaceKey: string,
  store: LineageStoreContract,
  customResolver?: (worktreeId: string, repoName: string, branch: string) => string | null
): ResolvedWorktreeTarget | null {
  const worktreeId = childWorkspaceKey.startsWith('worktree:')
    ? childWorkspaceKey.slice('worktree:'.length)
    : childWorkspaceKey

  let repoName = 'unknown'
  let branchHint = 'main'
  let candidatePath: string | null = null

  // Check composite id (repoId::worktreePath)
  const parsed = splitWorktreeId(worktreeId)
  if (parsed) {
    repoName = parsed.repoId
    candidatePath = parsed.worktreePath
  } else if (worktreeId.includes(':')) {
    const colonParts = worktreeId.split(':')
    repoName = colonParts[0]
    branchHint = colonParts.slice(1).join(':')
  } else {
    branchHint = worktreeId
  }

  // Check store worktrees if available
  const anyStore = store as any
  if (typeof anyStore.getWorktree === 'function') {
    const wt = anyStore.getWorktree(worktreeId)
    if (wt?.path) {
      candidatePath = wt.path
      if (wt.repoId) repoName = wt.repoId
      if (wt.branch) branchHint = wt.branch
    }
  }

  if (customResolver) {
    const resolved = customResolver(worktreeId, repoName, branchHint)
    if (resolved) {
      candidatePath = resolved
    }
  }

  if (!candidatePath) {
    // Try candidate path relative to workspaces root
    const standardPath = path.join(getDefaultWorkspacesRoot(), repoName, branchHint)
    if (fs.existsSync(standardPath)) {
      candidatePath = standardPath
    } else if (path.isAbsolute(branchHint) && fs.existsSync(branchHint)) {
      candidatePath = branchHint
    }
  }

  if (!candidatePath || !fs.existsSync(candidatePath)) {
    // Absent from disk
    return null
  }

  return {
    worktreeId,
    repoName,
    branchHint,
    worktreePath: path.resolve(candidatePath)
  }
}

export async function getLineageStatus(
  store: LineageStoreContract,
  parentWorkspaceKey: string,
  options: GetLineageStatusOptions = {}
): Promise<LineageGitStatusPayload> {
  if (!parentWorkspaceKey || typeof parentWorkspaceKey !== 'string') {
    throw new Error('parentWorkspaceKey is required')
  }

  const concurrencyLimit = Math.min(options.concurrencyLimit ?? 6, 6)
  const statusRunner = options.gitStatusFn ?? ((p: string) => getStatus(p))

  // 1. Fetch child lineage records
  const allLineages =
    (typeof store.getAllWorkspaceLineage === 'function' && store.getAllWorkspaceLineage()) ||
    (typeof store.getState === 'function' && store.getState()?.workspaceLineageByChildKey) ||
    {}

  const childEntries = Object.values(allLineages).filter(
    (lineage) => lineage && lineage.parentWorkspaceKey === parentWorkspaceKey
  )

  // 2. Resolve worktree targets and filter out absent paths (AC 7: omit deleted worktree)
  const targets: ResolvedWorktreeTarget[] = []
  for (const entry of childEntries) {
    const target = resolveWorktreeTarget(
      entry.childWorkspaceKey,
      store,
      options.worktreePathResolver
    )
    if (target) {
      targets.push(target)
    }
  }

  // 3. Execute git status in parallel with max 6 concurrency limit (AC 5, AC 8)
  const worktreeStatuses = await runWithConcurrencyLimit(
    targets,
    concurrencyLimit,
    async (target): Promise<{ repoName: string; status: LineageWorktreeStatus }> => {
      try {
        const res = await statusRunner(target.worktreePath)
        const branch = res.branch || res.head || target.branchHint
        const dirtyFiles = res.entries || []

        return {
          repoName: target.repoName,
          status: {
            worktreeId: target.worktreeId,
            worktreePath: target.worktreePath,
            branch,
            dirtyFiles
          }
        }
      } catch (err) {
        // If status fails for one worktree, report empty dirty files rather than crashing the aggregation
        return {
          repoName: target.repoName,
          status: {
            worktreeId: target.worktreeId,
            worktreePath: target.worktreePath,
            branch: target.branchHint,
            dirtyFiles: []
          }
        }
      }
    }
  )

  // 4. Group primarily by Project / Repository (repoName) (AC 6)
  const projects: Record<string, LineageProjectStatus> = {}
  let totalDirtyFiles = 0

  for (const item of worktreeStatuses) {
    if (!projects[item.repoName]) {
      projects[item.repoName] = {
        repoName: item.repoName,
        worktrees: []
      }
    }
    projects[item.repoName].worktrees.push(item.status)
    totalDirtyFiles += item.status.dirtyFiles.length
  }

  return {
    status: 200,
    parentKey: parentWorkspaceKey,
    parentWorkspaceKey,
    totalDirtyFiles,
    projects
  }
}

export async function commitLineageProject(
  _store: LineageStoreContract,
  args: LineageCommitProjectArgs
): Promise<LineageCommitProjectResult> {
  const { worktreePath, message } = args
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return {
      status: 400,
      success: false,
      error: 'Commit message is required'
    }
  }

  if (!worktreePath || !fs.existsSync(worktreePath)) {
    return {
      status: 400,
      success: false,
      error: `Worktree path does not exist: ${worktreePath}`
    }
  }

  try {
    const commitResult = await commitChanges(worktreePath, message.trim())
    if (!commitResult.success) {
      return {
        status: 500,
        success: false,
        error: commitResult.error ?? 'Commit failed'
      }
    }

    // Retrieve commit hash
    let commitHash: string | undefined
    try {
      const revParse = await gitExecFileAsync(
        ['rev-parse', 'HEAD'],
        gitOptionsForWorktree(worktreePath)
      )
      commitHash = revParse.stdout.trim()
    } catch {}

    return {
      status: 200,
      success: true,
      commitHash
    }
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
