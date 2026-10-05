import path from 'node:path'
import type {
  LineageAddManualLinkArgs,
  LineageAddManualLinkResult,
  LineageRemoveManualLinkArgs,
  LineageRemoveManualLinkResult
} from '../../shared/fleet-lineage-types'
import type { LineageManualLink } from '../../shared/lineage-discovery-types'
import { lineageManualLinkDedupeKey } from '../../shared/lineage-manual-link-shape'
import { parsePullRequestReference } from '../../shared/lineage-pr-reference'
import { isFolderRepo } from '../../shared/repo-kind'
import { WORKTREE_ID_SEPARATOR } from '../../shared/worktree/id'
import type { PatternRepo } from './lineage-name-pattern-discovery'
import type { LineageStoreContract } from './workspace-lineage-service'

const MAX_REFERENCE_LENGTH = 2048
const MAX_BRANCH_LENGTH = 1024
const MAX_PATH_LENGTH = 4096

export type LineageManualLinkDeps = {
  /** Best effort; null, '' or a throw leave the link without a branch. */
  lookupPullRequestHeadBranch?: (
    repo: PatternRepo,
    number: number,
    provider: 'github' | 'gitlab' | undefined
  ) => Promise<string | null>
}

type Failure = { success: false; error: string }
type Draft = { link: Omit<LineageManualLink, 'id' | 'addedAt'>; repo: PatternRepo }

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : null
}

function fail(error: string): Failure {
  return { success: false, error }
}

function findRepoById(store: LineageStoreContract, repoId: string): PatternRepo | undefined {
  return store.getRepos?.().find((candidate) => candidate.id === repoId)
}

function draftPullRequest(store: LineageStoreContract, reference: unknown): Draft | Failure {
  if (!isNonEmptyString(reference, MAX_REFERENCE_LENGTH)) {
    return fail('Invalid pull request reference')
  }
  const parsed = parsePullRequestReference(reference)
  if (!parsed) {
    return fail('Unrecognized pull request reference')
  }
  const repo = store
    .getRepos?.()
    .find((candidate) => candidate.displayName.toLowerCase() === parsed.repoName.toLowerCase())
  if (!repo) {
    return fail('Repository not registered in Orca')
  }
  return {
    repo,
    link: {
      kind: 'pr',
      repoName: repo.displayName,
      repoId: repo.id,
      number: parsed.number,
      ...(parsed.url ? { url: parsed.url } : {})
    }
  }
}

function findGitRepo(store: LineageStoreContract, repoId: unknown): PatternRepo | Failure {
  if (!isNonEmptyString(repoId, MAX_REFERENCE_LENGTH)) {
    return fail('Invalid repository')
  }
  const repo = findRepoById(store, repoId)
  if (!repo) {
    return fail('Repository not registered in Orca')
  }
  if (isFolderRepo(repo)) {
    return fail('Folder projects have no branches or worktrees')
  }
  return repo
}

function draftTarget(store: LineageStoreContract, rawTarget: unknown): Draft | Failure {
  const target = readRecord(rawTarget)
  if (!target) {
    return fail('Invalid target')
  }
  if (target.kind === 'pr') {
    return draftPullRequest(store, target.reference)
  }
  if (target.kind === 'branch') {
    const repo = findGitRepo(store, target.repoId)
    if ('success' in repo) {
      return repo
    }
    const branch =
      typeof target.branch === 'string' ? target.branch.replace(/^refs\/heads\//, '') : ''
    if (!isNonEmptyString(branch, MAX_BRANCH_LENGTH)) {
      return fail('Invalid branch')
    }
    return { repo, link: { kind: 'branch', repoName: repo.displayName, repoId: repo.id, branch } }
  }
  if (target.kind === 'worktree') {
    const repo = findGitRepo(store, target.repoId)
    if ('success' in repo) {
      return repo
    }
    const worktreePath = target.worktreePath
    // why: an SSH worktree path is POSIX on the remote host even when this host is Windows
    if (
      !isNonEmptyString(worktreePath, MAX_PATH_LENGTH) ||
      !(path.posix.isAbsolute(worktreePath) || path.win32.isAbsolute(worktreePath))
    ) {
      return fail('Invalid worktree path')
    }
    return {
      repo,
      link: {
        kind: 'worktree',
        repoName: repo.displayName,
        repoId: repo.id,
        worktreePath,
        worktreeId: `${repo.id}${WORKTREE_ID_SEPARATOR}${worktreePath}`
      }
    }
  }
  return fail('Invalid target')
}

function findDuplicate(
  store: LineageStoreContract,
  parentWorkspaceKey: string,
  link: Omit<LineageManualLink, 'id' | 'addedAt'>
): LineageManualLink | undefined {
  const key = lineageManualLinkDedupeKey({ ...link, id: '', addedAt: 0 })
  return (store.getLineageManualLinks?.(parentWorkspaceKey) ?? []).find(
    (existing) => lineageManualLinkDedupeKey(existing) === key
  )
}

async function lookupBranch(
  deps: LineageManualLinkDeps,
  draft: Draft
): Promise<string | undefined> {
  if (draft.link.kind !== 'pr' || draft.link.number === undefined) {
    return undefined
  }
  try {
    const provider = draft.link.url
      ? parsePullRequestReference(draft.link.url)?.provider
      : undefined
    const branch = await deps.lookupPullRequestHeadBranch?.(draft.repo, draft.link.number, provider)
    return typeof branch === 'string' && branch.length > 0 ? branch : undefined
  } catch {
    // why: the head branch only helps match a local worktree; a failed lookup never fails the add
    return undefined
  }
}

export async function addLineageManualLink(
  store: LineageStoreContract,
  args: LineageAddManualLinkArgs,
  deps: LineageManualLinkDeps = {}
): Promise<LineageAddManualLinkResult> {
  // hazard: IPC payloads are untrusted at runtime despite the static types
  const raw = readRecord(args)
  if (!raw || !isNonEmptyString(raw.parentWorkspaceKey, MAX_REFERENCE_LENGTH)) {
    return fail('Invalid pull request reference')
  }
  const parentWorkspaceKey = raw.parentWorkspaceKey
  const draft =
    raw.target === undefined
      ? draftPullRequest(store, raw.reference)
      : draftTarget(store, raw.target)
  if ('success' in draft) {
    return draft
  }
  const before = findDuplicate(store, parentWorkspaceKey, draft.link)
  if (before) {
    return { success: true, link: before }
  }
  const branch = await lookupBranch(deps, draft)
  // invariant: re-check after the await; another add may have stored the same link meanwhile
  const after = findDuplicate(store, parentWorkspaceKey, draft.link)
  if (after) {
    return { success: true, link: after }
  }
  const link: LineageManualLink = {
    id: crypto.randomUUID(),
    ...draft.link,
    ...(branch ? { branch } : {}),
    addedAt: Date.now()
  }
  const existing = store.getLineageManualLinks?.(parentWorkspaceKey) ?? []
  store.setLineageManualLinks?.(parentWorkspaceKey, [...existing, link])
  return { success: true, link }
}

export function removeLineageManualLink(
  store: LineageStoreContract,
  args: LineageRemoveManualLinkArgs
): LineageRemoveManualLinkResult {
  if (
    !isNonEmptyString(args?.parentWorkspaceKey, MAX_REFERENCE_LENGTH) ||
    !isNonEmptyString(args?.linkId, MAX_REFERENCE_LENGTH)
  ) {
    return { success: false }
  }
  const existing = store.getLineageManualLinks?.(args.parentWorkspaceKey) ?? []
  store.setLineageManualLinks?.(
    args.parentWorkspaceKey,
    existing.filter((link) => link.id !== args.linkId)
  )
  return { success: true }
}
