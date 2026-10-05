import { describe, it, expect } from 'vitest'
import type { ManualPullRequestLink } from '../../../src/shared/lineage-discovery-types'
import {
  addLineageManualLink,
  removeLineageManualLink
} from '../../../src/main/lineage/lineage-manual-links'
import type { LineageStoreContract } from '../../../src/main/lineage/workspace-lineage-service'

const PARENT = 'worktree:r0::/o/tower'

function makeStore(initial: ManualPullRequestLink[] = []) {
  let links = initial
  const store: LineageStoreContract = {
    getRepos: () => [{ id: 'r1', path: '/r', displayName: 'loan-core' }],
    getLineageManualLinks: () => links,
    setLineageManualLinks: (_key, next) => {
      links = next
    }
  }
  return { store, get: () => links }
}

describe('addLineageManualLink', () => {
  it('stores a parsed link for a registered repo', () => {
    const { store, get } = makeStore()
    const res = addLineageManualLink(store, {
      parentWorkspaceKey: PARENT,
      reference: 'loan-core#12'
    })
    expect(res.success).toBe(true)
    expect(res.link).toMatchObject({ repoName: 'loan-core', number: 12 })
    expect(res.link?.id).toBeTruthy()
    expect(get()).toHaveLength(1)
  })
  it('rejects unparseable references', () => {
    const { store, get } = makeStore()
    expect(
      addLineageManualLink(store, { parentWorkspaceKey: PARENT, reference: 'nonsense' })
    ).toEqual({ success: false, error: 'Unrecognized pull request reference' })
    expect(get()).toEqual([])
  })
  it('rejects unregistered repos', () => {
    const { store } = makeStore()
    expect(
      addLineageManualLink(store, { parentWorkspaceKey: PARENT, reference: 'ghost#1' })
    ).toEqual({ success: false, error: 'Repository not registered in Orca' })
  })
  it('returns the existing link instead of duplicating', () => {
    const { store, get } = makeStore()
    const first = addLineageManualLink(store, {
      parentWorkspaceKey: PARENT,
      reference: 'loan-core#12'
    })
    const second = addLineageManualLink(store, {
      parentWorkspaceKey: PARENT,
      reference: 'https://github.com/o/loan-core/pull/12'
    })
    expect(second.success).toBe(true)
    expect(second.link?.id).toBe(first.link?.id)
    expect(get()).toHaveLength(1)
  })
})

describe('removeLineageManualLink', () => {
  it('removes by id', () => {
    const { store, get } = makeStore([{ id: 'a', repoName: 'loan-core', number: 1, addedAt: 1 }])
    expect(removeLineageManualLink(store, { parentWorkspaceKey: PARENT, linkId: 'a' })).toEqual({
      success: true
    })
    expect(get()).toEqual([])
  })
})
