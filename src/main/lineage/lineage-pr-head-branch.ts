import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { PatternRepo } from './lineage-name-pattern-discovery'

const LOOKUP_TIMEOUT_MS = 15_000

async function lookup(
  repo: PatternRepo,
  number: number,
  provider: 'github' | 'gitlab' | undefined
): Promise<string | null> {
  // why: lazy imports keep the provider clients out of every lineage IPC import graph
  const resolved =
    provider ??
    (
      await (
        await import('../source-control/forge-provider')
      ).getForgeProviderForRepository({
        repoPath: repo.path,
        executionHostId: LOCAL_EXECUTION_HOST_ID
      })
    )?.id
  if (resolved === 'github') {
    const { getWorkItem } = await import('../github/client')
    const item = await getWorkItem(repo.path, number, 'pr')
    return item?.type === 'pr' ? (item.branchName ?? null) : null
  }
  if (resolved === 'gitlab') {
    const { getProjectSlug } = await import('../gitlab/merge-request-lookup')
    const { getWorkItemByProjectRef } = await import('../gitlab/work-item-queries')
    const projectRef = await getProjectSlug(repo.path)
    if (!projectRef) {
      return null
    }
    const item = await getWorkItemByProjectRef(repo.path, projectRef, number, 'mr')
    return item?.branchName ?? null
  }
  return null
}

/** Best-effort head branch of a pull/merge request, resolved once when it is added to a tower. */
export async function lookupLineagePullRequestHeadBranch(
  repo: PatternRepo,
  number: number,
  provider: 'github' | 'gitlab' | undefined
): Promise<string | null> {
  // hazard: SSH repos must query from their execution host; the tower add stays local-only
  if (repo.connectionId) {
    return null
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)
    timer.unref?.()
  })
  try {
    return await Promise.race([lookup(repo, number, provider).catch(() => null), timeout])
  } finally {
    clearTimeout(timer)
  }
}
