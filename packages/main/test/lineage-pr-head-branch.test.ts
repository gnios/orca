import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getWorkItem: vi.fn(),
  getProjectSlug: vi.fn(),
  getWorkItemByProjectRef: vi.fn(),
  getForgeProviderForRepository: vi.fn()
}))

vi.mock('../../../src/main/github/client', () => ({ getWorkItem: mocks.getWorkItem }))
vi.mock('../../../src/main/gitlab/merge-request-lookup', () => ({
  getProjectSlug: mocks.getProjectSlug
}))
vi.mock('../../../src/main/gitlab/work-item-queries', () => ({
  getWorkItemByProjectRef: mocks.getWorkItemByProjectRef
}))
vi.mock('../../../src/main/source-control/forge-provider', () => ({
  getForgeProviderForRepository: mocks.getForgeProviderForRepository
}))

import { lookupLineagePullRequestHeadBranch } from '../../../src/main/lineage/lineage-pr-head-branch'

const repo = { id: 'r1', path: '/repos/api', displayName: 'api' }

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
})

describe('lookupLineagePullRequestHeadBranch', () => {
  it('reads the GitHub PR head branch', async () => {
    mocks.getWorkItem.mockResolvedValue({ type: 'pr', branchName: 'feat/a' })
    expect(await lookupLineagePullRequestHeadBranch(repo, 3, 'github')).toBe('feat/a')
    expect(mocks.getWorkItem).toHaveBeenCalledWith('/repos/api', 3, 'pr')
    expect(mocks.getForgeProviderForRepository).not.toHaveBeenCalled()
  })

  it('reads the GitLab MR source branch', async () => {
    mocks.getProjectSlug.mockResolvedValue({ host: 'gitlab.com', path: 'g/api' })
    mocks.getWorkItemByProjectRef.mockResolvedValue({ branchName: 'feat/b' })
    expect(await lookupLineagePullRequestHeadBranch(repo, 4, 'gitlab')).toBe('feat/b')
    expect(mocks.getWorkItemByProjectRef).toHaveBeenCalledWith(
      '/repos/api',
      { host: 'gitlab.com', path: 'g/api' },
      4,
      'mr'
    )
  })

  it('detects the provider for a repo#n reference', async () => {
    mocks.getForgeProviderForRepository.mockResolvedValue({ id: 'github' })
    mocks.getWorkItem.mockResolvedValue({ type: 'pr', branchName: 'feat/c' })
    expect(await lookupLineagePullRequestHeadBranch(repo, 5, undefined)).toBe('feat/c')
  })

  it('returns null for SSH repos, unsupported providers and failures', async () => {
    expect(
      await lookupLineagePullRequestHeadBranch({ ...repo, connectionId: 'ssh-1' }, 1, 'github')
    ).toBeNull()
    expect(mocks.getWorkItem).not.toHaveBeenCalled()
    mocks.getForgeProviderForRepository.mockResolvedValue({ id: 'bitbucket' })
    expect(await lookupLineagePullRequestHeadBranch(repo, 1, undefined)).toBeNull()
    mocks.getWorkItem.mockRejectedValue(new Error('gh down'))
    expect(await lookupLineagePullRequestHeadBranch(repo, 1, 'github')).toBeNull()
  })
})
