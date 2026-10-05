import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GitWorktreeInfo } from '../../../src/shared/worktree/types'
import type { WorkspaceLineage } from '../../../src/shared/worktree/lineage-types'
import type { LineageDiscoverySettings } from '../../../src/shared/lineage-discovery-types'
import type { ManualPullRequestLink } from '../../../src/shared/lineage-discovery-types'
import type { WorkspaceKey } from '../../../src/shared/folder-workspace-types'
import { getLineageStatus } from '../../../src/main/lineage/lineage-git-status-service'
import { resolveLineageMembers } from '../../../src/main/lineage/lineage-member-resolver'
import { resolveEffectiveDiscoverySettings } from '../../../src/main/lineage/lineage-discovery-settings'
import type { LineageStoreContract } from '../../../src/main/lineage/workspace-lineage-service'

const PARENT: WorkspaceKey = 'worktree:r0::/o/tower/levgp-483-new-loan'

type Repo = { id: string; path: string; displayName: string; connectionId?: string | null }

function wt(path: string, branch: string): GitWorktreeInfo {
  return { path, head: 'abc', branch, isBare: false, isMainWorktree: true }
}

function makeStore(opts: {
  repos?: Repo[]
  settings?: unknown
  links?: ManualPullRequestLink[]
  lineage?: Record<string, WorkspaceLineage>
}): LineageStoreContract {
  return {
    getAllWorkspaceLineage: () => opts.lineage ?? {},
    getRepos: () => opts.repos ?? [],
    getSettings: () => ({ lineageDiscovery: opts.settings }),
    getLineageManualLinks: () => opts.links ?? []
  }
}

const repos: Repo[] = [
  { id: 'r1', path: '/repos/loan-core', displayName: 'loan-core' },
  { id: 'r2', path: '/repos/credit', displayName: 'credit' }
]
const listWorktreesFn = async (repoPath: string): Promise<GitWorktreeInfo[]> => [
  wt(repoPath, 'refs/heads/feature/levgp-483-x'),
  wt(`${repoPath}-levgp-483`, 'refs/heads/other')
]

describe('resolveLineageMembers', () => {
  it('returns pattern members by default and honours patternEnabled:false', async () => {
    const on = await resolveLineageMembers(makeStore({ repos }), PARENT, { listWorktreesFn })
    expect(on.keys).toEqual(['LEVGP-483'])
    expect(on.members.map((m) => m.matchedBy)).toEqual(['pattern', 'pattern'])
    const settings: Partial<LineageDiscoverySettings> = { patternEnabled: false }
    const off = await resolveLineageMembers(makeStore({ repos, settings }), PARENT, {
      listWorktreesFn
    })
    expect(off.members).toEqual([])
  })

  it('honours lineageEnabled:false', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-lineage-'))
    const lineage: Record<string, WorkspaceLineage> = {
      c: {
        childWorkspaceKey: `worktree:r1::${dir}`,
        parentWorkspaceKey: PARENT,
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' },
        createdAt: 0
      }
    }
    const noPattern = { patternEnabled: false }
    const store = (settings: object) => makeStore({ repos, lineage, settings })
    const opts = {
      listWorktreesFn,
      worktreePathResolver: (id: string) => id.split('::')[1] ?? null
    }
    const on = await resolveLineageMembers(store(noPattern), PARENT, opts)
    expect(on.members.some((m) => m.matchedBy === 'lineage')).toBe(true)
    const off = await resolveLineageMembers(
      store({ ...noPattern, lineageEnabled: false }),
      PARENT,
      opts
    )
    expect(off.members.some((m) => m.matchedBy === 'lineage')).toBe(false)
  })

  it('matches on the worktree directory name when matchOn is worktree-name', async () => {
    const branchOnly = await resolveLineageMembers(
      makeStore({ repos: [repos[0]], settings: { matchOn: 'branch' } }),
      PARENT,
      { listWorktreesFn }
    )
    expect(branchOnly.members.map((m) => m.worktreePath)).toEqual(['/repos/loan-core'])
    const byName = await resolveLineageMembers(
      makeStore({ repos: [repos[0]], settings: { matchOn: 'worktree-name' } }),
      PARENT,
      { listWorktreesFn }
    )
    expect(byName.members.map((m) => m.worktreePath)).toEqual(['/repos/loan-core-levgp-483'])
    const both = await resolveLineageMembers(
      makeStore({ repos: [repos[0]], settings: { matchOn: 'both' } }),
      PARENT,
      { listWorktreesFn }
    )
    expect(both.members).toHaveLength(2)
  })

  it('scans only repos in repoScope', async () => {
    const result = await resolveLineageMembers(
      makeStore({ repos, settings: { repoScope: ['r2'] } }),
      PARENT,
      { listWorktreesFn }
    )
    expect(new Set(result.members.map((m) => m.repoName))).toEqual(new Set(['credit']))
  })

  it('never scans a remote repo', async () => {
    const seen: string[] = []
    const result = await resolveLineageMembers(
      makeStore({ repos: [{ ...repos[0], connectionId: 'ssh-1' }, repos[1]] }),
      PARENT,
      {
        listWorktreesFn: async (p) => {
          seen.push(p)
          return listWorktreesFn(p)
        }
      }
    )
    expect(seen).toEqual(['/repos/credit'])
    expect(result.members.every((m) => m.repoName === 'credit')).toBe(true)
  })

  it('keeps a manual link whose repo has no local worktree', async () => {
    const links = [{ id: 'l1', repoName: 'ghost', number: 7, url: 'u', addedAt: 1 }]
    const result = await resolveLineageMembers(makeStore({ repos: [], links }), PARENT, {
      listWorktreesFn
    })
    expect(result.members).toEqual([
      {
        repoName: 'ghost',
        branch: '',
        matchedBy: 'manual',
        pr: { number: 7, url: 'u' },
        manualLinkId: 'l1',
        reasons: ['added manually']
      }
    ])
  })

  it('reports patternError and falls back to the default pattern', async () => {
    const result = await resolveLineageMembers(
      makeStore({ repos, settings: { keyRegex: '([' } }),
      PARENT,
      { listWorktreesFn }
    )
    expect(result.patternError).toMatch(/invalid/i)
    expect(result.keys).toEqual(['LEVGP-483'])
  })

  it('ignores empty-string keys from a regex that matches nothing', async () => {
    const result = await resolveLineageMembers(
      makeStore({ repos, settings: { keyRegex: 'z*' } }),
      PARENT,
      { listWorktreesFn }
    )
    expect(result.keys).toEqual([])
    expect(result.members).toEqual([])
  })

  it('lets explicit ticketKeys override extraction', async () => {
    const result = await resolveLineageMembers(makeStore({ repos }), 'folder:tower', {
      listWorktreesFn,
      ticketKeys: ['LEVGP-483']
    })
    expect(result.members).toHaveLength(2)
  })
})

describe('resolveEffectiveDiscoverySettings', () => {
  it('accepts only well-typed stored fields', () => {
    const effective = resolveEffectiveDiscoverySettings({
      lineageEnabled: 'yes',
      patternEnabled: false,
      keyRegex: 42,
      matchOn: 'nonsense',
      repoScope: [1, 'r1']
    })
    expect(effective).toEqual({
      lineageEnabled: true,
      patternEnabled: false,
      keyRegex: '[A-Za-z][A-Za-z0-9]{1,9}-\\d+',
      matchOn: 'branch',
      repoScope: 'all'
    })
  })
  it('survives non-object input', () => {
    expect(resolveEffectiveDiscoverySettings(null).lineageEnabled).toBe(true)
    expect(resolveEffectiveDiscoverySettings('x').repoScope).toBe('all')
  })
  it('accepts valid values', () => {
    expect(
      resolveEffectiveDiscoverySettings({ matchOn: 'both', repoScope: ['a'], keyRegex: 'X-\\d+' })
    ).toMatchObject({ matchOn: 'both', repoScope: ['a'], keyRegex: 'X-\\d+' })
  })
})

describe('getLineageStatus parent workspace', () => {
  const gitStatusFn = async () => ({
    branch: 'b',
    head: 'h',
    conflictOperation: 'unknown' as const,
    entries: []
  })
  const noPattern = { patternEnabled: false }

  it('lists the tower worktree first as lineage, once, when it exists on disk', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-parent-'))
    const parentKey: WorkspaceKey = `worktree:r0::${dir}`
    const store = makeStore({ repos: [repos[0]], settings: noPattern })
    const payload = await getLineageStatus(store, parentKey, { gitStatusFn })
    const all = Object.values(payload.projects).flatMap((project) => project.worktrees)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ worktreePath: dir, matchedBy: 'lineage' })
  })

  it('does not duplicate the tower when a child or pattern match has the same path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-parent-'))
    const parentKey: WorkspaceKey = `worktree:r0::${dir}`
    const lineage: Record<string, WorkspaceLineage> = {
      c: {
        childWorkspaceKey: parentKey,
        parentWorkspaceKey: parentKey,
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' },
        createdAt: 0
      }
    }
    const store = makeStore({ repos: [{ ...repos[0], path: dir }], lineage })
    const payload = await getLineageStatus(store, parentKey, {
      gitStatusFn,
      ticketKeys: ['LEVGP-483'],
      listWorktreesFn: async () => [wt(dir, 'refs/heads/feature/levgp-483-x')]
    })
    expect(Object.values(payload.projects).flatMap((project) => project.worktrees)).toHaveLength(1)
  })

  it('omits the tower when its path does not exist', async () => {
    const store = makeStore({ repos: [], settings: noPattern })
    const payload = await getLineageStatus(store, 'worktree:r0::/definitely/not/here', {
      gitStatusFn
    })
    expect(payload.projects).toEqual({})
  })
})

describe('getLineageStatus shares the resolver', () => {
  it('emits matchedBy and reason and leaves out worktree-less manual members', async () => {
    const links = [{ id: 'l1', repoName: 'ghost', number: 7, addedAt: 1 }]
    const payload = await getLineageStatus(makeStore({ repos: [repos[0]], links }), PARENT, {
      listWorktreesFn,
      gitStatusFn: async () => ({
        branch: 'b',
        head: 'h',
        conflictOperation: 'unknown',
        entries: []
      })
    })
    const all = Object.values(payload.projects).flatMap((project) => project.worktrees)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ matchedBy: 'pattern', reason: ['branch matches LEVGP-483'] })
    expect(payload.projects.ghost).toBeUndefined()
  })
})
