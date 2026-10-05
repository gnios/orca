import type {
  LineageAddManualLinkArgs,
  LineageAddManualLinkResult,
  LineageRemoveManualLinkArgs,
  LineageRemoveManualLinkResult
} from '../../shared/fleet-lineage-types'
import { parsePullRequestReference } from '../../shared/lineage-pr-reference'
import type { LineageStoreContract } from './workspace-lineage-service'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function addLineageManualLink(
  store: LineageStoreContract,
  args: LineageAddManualLinkArgs
): LineageAddManualLinkResult {
  // hazard: IPC payloads are untrusted at runtime despite the static types
  if (!isNonEmptyString(args?.parentWorkspaceKey) || !isNonEmptyString(args?.reference)) {
    return { success: false, error: 'Invalid pull request reference' }
  }
  const parsed = parsePullRequestReference(args.reference)
  if (!parsed) {
    return { success: false, error: 'Unrecognized pull request reference' }
  }
  const repo = store
    .getRepos?.()
    .find((candidate) => candidate.displayName.toLowerCase() === parsed.repoName.toLowerCase())
  if (!repo) {
    return { success: false, error: 'Repository not registered in Orca' }
  }
  const existing = store.getLineageManualLinks?.(args.parentWorkspaceKey) ?? []
  const duplicate = existing.find(
    (link) => link.repoName === repo.displayName && link.number === parsed.number
  )
  if (duplicate) {
    return { success: true, link: duplicate }
  }
  const link = {
    id: crypto.randomUUID(),
    repoName: repo.displayName,
    number: parsed.number,
    ...(parsed.url ? { url: parsed.url } : {}),
    addedAt: Date.now()
  }
  store.setLineageManualLinks?.(args.parentWorkspaceKey, [...existing, link])
  return { success: true, link }
}

export function removeLineageManualLink(
  store: LineageStoreContract,
  args: LineageRemoveManualLinkArgs
): LineageRemoveManualLinkResult {
  if (!isNonEmptyString(args?.parentWorkspaceKey) || !isNonEmptyString(args?.linkId)) {
    return { success: false }
  }
  const existing = store.getLineageManualLinks?.(args.parentWorkspaceKey) ?? []
  store.setLineageManualLinks?.(
    args.parentWorkspaceKey,
    existing.filter((link) => link.id !== args.linkId)
  )
  return { success: true }
}
