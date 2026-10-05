import type { LineageMember, LineageMemberPullRequest } from '../../shared/lineage-discovery-types'
import { parsePullRequestReference } from '../../shared/lineage-pr-reference'
import {
  resolveLineageTargets,
  type ResolveLineageTargetsOptions
} from './lineage-target-resolution'
import { mergeLineageMembers } from './lineage-member-merge'
import type { LineageStoreContract } from './workspace-lineage-service'

function providerOf(url: string | undefined): Pick<LineageMemberPullRequest, 'provider'> {
  const provider = url ? parsePullRequestReference(url)?.provider : undefined
  return provider ? { provider } : {}
}

export type ResolvedLineageMembers = {
  members: LineageMember[]
  keys: string[]
  patternError?: string
}

export async function resolveLineageMembers(
  store: LineageStoreContract,
  parentWorkspaceKey: string,
  options: ResolveLineageTargetsOptions = {}
): Promise<ResolvedLineageMembers> {
  const { targets, keys, patternError } = await resolveLineageTargets(
    store,
    parentWorkspaceKey,
    options
  )
  const fromWorktrees: LineageMember[] = targets.map((target) => ({
    repoName: target.repoName,
    branch: target.branchHint,
    worktreePath: target.worktreePath,
    worktreeId: target.worktreeId,
    matchedBy: target.matchedBy ?? 'lineage',
    reasons: target.reasons ?? [],
    ...(target.isTower ? { isTower: true } : {}),
    ...(target.unverifiable ? { unverifiable: true } : {})
  }))
  const manual: LineageMember[] = (store.getLineageManualLinks?.(parentWorkspaceKey) ?? []).map(
    (link) => ({
      repoName: link.repoName,
      branch: '',
      matchedBy: 'manual',
      pr: {
        number: link.number,
        ...(link.url ? { url: link.url } : {}),
        ...providerOf(link.url)
      },
      manualLinkId: link.id,
      reasons: ['added manually']
    })
  )
  const members = mergeLineageMembers([...fromWorktrees, ...manual])
  return patternError ? { members, keys, patternError } : { members, keys }
}
