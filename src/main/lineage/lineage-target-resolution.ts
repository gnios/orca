import fs from 'node:fs'
import path from 'node:path'
import { splitWorktreeId } from '../../shared/worktree/id'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import type { LineageMatchSource } from '../../shared/lineage-discovery-types'
import { extractKeysWithPattern } from '../../shared/lineage-ticket-keys'
import { getDefaultWorkspacesRoot } from './workspaces-fs-watcher'
import { resolveEffectiveDiscoverySettings } from './lineage-discovery-settings'
import { discoverPatternTargets } from './lineage-name-pattern-discovery'
import type { LineageStoreContract } from './workspace-lineage-service'

export type ResolvedWorktreeTarget = {
  worktreeId: string
  repoName: string
  branchHint: string
  worktreePath: string
  matchedBy?: LineageMatchSource
  reasons?: string[]
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

  const wt = store.getWorktree?.(worktreeId)
  if (wt?.path) {
    candidatePath = wt.path
    if (wt.repoId) {
      repoName = wt.repoId
    }
    if (wt.branch) {
      branchHint = wt.branch
    }
  }

  if (customResolver) {
    const resolved = customResolver(worktreeId, repoName, branchHint)
    if (resolved) {
      candidatePath = resolved
    }
  }

  if (!candidatePath) {
    const standardPath = path.join(getDefaultWorkspacesRoot(), repoName, branchHint)
    if (fs.existsSync(standardPath)) {
      candidatePath = standardPath
    } else if (path.isAbsolute(branchHint) && fs.existsSync(branchHint)) {
      candidatePath = branchHint
    }
  }

  if (!candidatePath || !fs.existsSync(candidatePath)) {
    return null
  }

  return {
    worktreeId,
    repoName,
    branchHint,
    worktreePath: path.resolve(candidatePath)
  }
}

export type ResolveLineageTargetsOptions = {
  worktreePathResolver?: (worktreeId: string, repoName: string, branch: string) => string | null
  listWorktreesFn?: (repoPath: string) => Promise<GitWorktreeInfo[]>
  /** Renderer-provided keys; override extraction from the workspace name. */
  ticketKeys?: string[]
}

export type ResolvedLineageTargets = {
  targets: ResolvedWorktreeTarget[]
  keys: string[]
  patternError?: string
}

/** invariant: the single resolution of lineage + pattern worktrees; Source Control and the member resolver both call it. */
export async function resolveLineageTargets(
  store: LineageStoreContract,
  parentWorkspaceKey: string,
  options: ResolveLineageTargetsOptions = {}
): Promise<ResolvedLineageTargets> {
  const settings = resolveEffectiveDiscoverySettings(store.getSettings?.().lineageDiscovery)
  const extracted = extractKeysWithPattern(parentWorkspaceKey, settings.keyRegex)
  const keys = options.ticketKeys?.filter(Boolean) ?? extracted.keys
  const targets: ResolvedWorktreeTarget[] = []
  const knownPaths = new Set<string>()

  if (settings.lineageEnabled) {
    const allLineages =
      (typeof store.getAllWorkspaceLineage === 'function' && store.getAllWorkspaceLineage()) ||
      (typeof store.getState === 'function' && store.getState()?.workspaceLineageByChildKey) ||
      {}
    const childEntries = Object.values(allLineages).filter(
      (lineage) => lineage && lineage.parentWorkspaceKey === parentWorkspaceKey
    )
    for (const entry of childEntries) {
      const target = resolveWorktreeTarget(
        entry.childWorkspaceKey,
        store,
        options.worktreePathResolver
      )
      if (target) {
        targets.push({
          ...target,
          matchedBy: 'lineage',
          reasons: ['attached to this workspace']
        })
        knownPaths.add(target.worktreePath)
      }
    }
    const parentTarget = resolveWorktreeTarget(
      parentWorkspaceKey,
      store,
      options.worktreePathResolver
    )
    // invariant: the tower's own worktree is listed first so its changes show beside its children
    if (parentTarget && !knownPaths.has(parentTarget.worktreePath)) {
      targets.unshift({ ...parentTarget, matchedBy: 'lineage', reasons: ['this workspace'] })
      knownPaths.add(parentTarget.worktreePath)
    }
  }

  if (settings.patternEnabled) {
    const patternTargets = await discoverPatternTargets({
      repos: store.getRepos?.() ?? [],
      keys,
      excludePaths: [...knownPaths],
      matchOn: settings.matchOn,
      repoScope: settings.repoScope,
      listWorktreesFn: options.listWorktreesFn
    })
    for (const found of patternTargets) {
      targets.push({
        worktreeId: found.worktreePath,
        repoName: found.repoName,
        branchHint: found.branch,
        worktreePath: found.worktreePath,
        matchedBy: 'pattern',
        reasons: [`${found.matchedOn} matches ${found.matchedKey}`]
      })
    }
  }

  return extracted.error ? { targets, keys, patternError: extracted.error } : { targets, keys }
}
