import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GitStatusResult } from '../../../src/shared/git-status-types'
import type { GitWorktreeInfo } from '../../../src/shared/worktree/types'
import type { WorkspaceLineage } from '../../../src/shared/worktree/lineage-types'
import { getLineageStatus } from '../../../src/main/lineage/lineage-git-status-service'
import type { LineageStoreContract } from '../../../src/main/lineage/workspace-lineage-service'

const gitStatusFn = async (): Promise<GitStatusResult> => ({
  branch: 'feature/levgp-483-new-loan',
  head: 'abc',
  conflictOperation: 'unknown',
  entries: [{ path: 'a.py', status: 'modified', area: 'unstaged' }]
})

function makeStore(extra: Partial<LineageStoreContract> & { repos?: unknown[] } = {}) {
  return {
    getAllWorkspaceLineage: (): Record<string, WorkspaceLineage> => ({}),
    getRepos: () => extra.repos ?? [],
    ...extra
  } as LineageStoreContract
}

describe('getLineageStatus with name-pattern discovery', () => {
  const parentWorkspaceKey = 'worktree:gnios-context::/o/gnios-context/levgp-483-new-loan'
  const listWorktreesFn = async (repoPath: string): Promise<GitWorktreeInfo[]> => [
    {
      path: repoPath,
      head: 'abc',
      branch: 'refs/heads/feature/levgp-483-new-loan',
      isBare: false,
      isMainWorktree: true
    }
  ]

  it('includes unregistered checkouts whose branch matches the ticket in the parent name', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-pattern-'))
    const store = makeStore({
      repos: [{ id: 'r1', path: tmp, displayName: 'loan-core' }]
    })

    const payload = await getLineageStatus(store, parentWorkspaceKey, {
      gitStatusFn,
      listWorktreesFn
    })

    expect(Object.keys(payload.projects)).toEqual(['loan-core'])
    expect(payload.projects['loan-core'].worktrees[0]).toMatchObject({
      worktreePath: tmp,
      matchedBy: 'pattern'
    })
    expect(payload.totalDirtyFiles).toBe(1)
  })

  it('does not duplicate a worktree that is also registered explicitly', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-pattern-'))
    const childKey = `worktree:loan-core::${tmp}`
    const store = makeStore({
      repos: [{ id: 'loan-core', path: tmp, displayName: 'loan-core' }],
      getAllWorkspaceLineage: () => ({
        [childKey]: {
          childWorkspaceKey: `worktree:loan-core::${tmp}`,
          parentWorkspaceKey,
          origin: 'manual',
          capture: { source: 'manual-action', confidence: 'explicit' },
          createdAt: 0
        }
      })
    })

    const payload = await getLineageStatus(store, parentWorkspaceKey, {
      gitStatusFn,
      listWorktreesFn
    })

    const all = Object.values(payload.projects).flatMap((p) => p.worktrees)
    expect(all).toHaveLength(1)
    expect(all[0].matchedBy).toBe('lineage')
  })

  it('keeps explicit-only behaviour when the parent name carries no ticket key', async () => {
    const store = makeStore({ repos: [{ id: 'r1', path: '/x', displayName: 'x' }] })
    const payload = await getLineageStatus(store, 'folder:control-tower', {
      gitStatusFn,
      listWorktreesFn
    })
    expect(payload.projects).toEqual({})
  })
})
