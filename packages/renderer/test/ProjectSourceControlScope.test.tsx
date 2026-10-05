// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import {
  ProjectSourceControlScope,
  resetLineageCommitDrafts
} from '../../../src/renderer/src/components/right-sidebar/source-control/lineage/ProjectSourceControlScope'
import type { LineageProjectStatus } from '../../../src/shared/fleet-lineage-types'

const mockStoreState: { openDiff: ReturnType<typeof vi.fn>; worktreesByRepo: object } = {
  openDiff: vi.fn(),
  worktreesByRepo: {}
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState)
}))

describe('ProjectSourceControlScope', () => {
  let container: HTMLDivElement
  let root: Root
  let gitApi: Record<
    | 'bulkStage'
    | 'bulkUnstage'
    | 'bulkDiscard'
    | 'stage'
    | 'unstage'
    | 'discard'
    | 'lineageCommitProject',
    ReturnType<typeof vi.fn>
  >

  beforeEach(() => {
    vi.clearAllMocks()
    resetLineageCommitDrafts()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    // why: mocks mirror the real preload git API names (src/preload/api/git-operation-api.ts)
    gitApi = {
      bulkStage: vi.fn().mockResolvedValue(undefined),
      bulkUnstage: vi.fn().mockResolvedValue(undefined),
      bulkDiscard: vi.fn().mockResolvedValue(undefined),
      stage: vi.fn().mockResolvedValue(undefined),
      unstage: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn().mockResolvedValue(undefined),
      lineageCommitProject: vi
        .fn()
        .mockResolvedValue({ status: 200, success: true, commitHash: 'abc1234' })
    }
    Reflect.set(window, 'api', { git: gitApi })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    Reflect.deleteProperty(window, 'api')
  })

  const sampleProject: LineageProjectStatus = {
    repoName: 'billing-service',
    worktrees: [
      {
        worktreeId: 'wt-billing-primary',
        worktreePath: '/workspaces/billing-service/feat-checkout',
        branch: 'feat-checkout',
        dirtyFiles: [
          { path: 'src/checkout.ts', status: 'modified', area: 'staged' },
          { path: 'src/receipt.ts', status: 'modified', area: 'unstaged' }
        ]
      }
    ]
  }

  it('renders dedicated stage buttons per project', async () => {
    const onRefresh = vi.fn()
    await act(async () => {
      root.render(<ProjectSourceControlScope project={sampleProject} onRefresh={onRefresh} />)
    })

    const stageAllBtn = container.querySelector('button[aria-label="Stage All"]')
    const unstageAllBtn = container.querySelector('button[aria-label="Unstage All"]')
    const discardAllBtn = container.querySelector('button[aria-label="Discard All"]')
    const refreshBtn = container.querySelector('button[aria-label="Refresh"]')

    expect(stageAllBtn).not.toBeNull()
    expect(unstageAllBtn).not.toBeNull()
    expect(discardAllBtn).not.toBeNull()
    expect(refreshBtn).not.toBeNull()

    // invariant: Stage All touches only the Changes section's files, in this worktree
    await act(async () => {
      stageAllBtn?.click()
    })
    expect(gitApi.bulkStage).toHaveBeenCalledWith({
      worktreePath: '/workspaces/billing-service/feat-checkout',
      filePaths: ['src/receipt.ts']
    })

    await act(async () => {
      unstageAllBtn?.click()
    })
    expect(gitApi.bulkUnstage).toHaveBeenCalledWith({
      worktreePath: '/workspaces/billing-service/feat-checkout',
      filePaths: ['src/checkout.ts']
    })

    // Clicking refresh triggers onRefresh callback
    await act(async () => {
      refreshBtn?.click()
    })
    expect(onRefresh).toHaveBeenCalled()
  })

  it('persists commit draft per project', async () => {
    await act(async () => {
      root.render(<ProjectSourceControlScope project={sampleProject} />)
    })

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')
    expect(textarea).not.toBeNull()

    // Type a commit message draft using fireEvent
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'feat: add apple pay checkout support' } })
    })

    expect(textarea.value).toBe('feat: add apple pay checkout support')

    // Unmount component
    act(() => {
      root.unmount()
    })

    // Re-mount component and verify draft is preserved
    root = createRoot(container)
    await act(async () => {
      root.render(<ProjectSourceControlScope project={sampleProject} />)
    })

    const restoredTextarea = container.querySelector<HTMLTextAreaElement>('textarea')
    expect(restoredTextarea.value).toBe('feat: add apple pay checkout support')
  })

  describe('opening a file diff without onOpenFileDiff', () => {
    const childId = 'r1::/workspaces/loan-core/child'
    const patternId = 'r1::/repos/loan-core'
    const mixedProject: LineageProjectStatus = {
      repoName: 'Loan Core',
      worktrees: [
        {
          worktreeId: childId,
          worktreePath: '/workspaces/loan-core/child',
          branch: 'feat-a',
          matchedBy: 'lineage',
          dirtyFiles: [{ path: 'src/child.ts', status: 'modified', area: 'staged' }]
        },
        {
          worktreeId: patternId,
          worktreePath: '/repos/loan-core',
          branch: 'feat-b',
          matchedBy: 'pattern',
          dirtyFiles: [{ path: 'src/pattern.ts', status: 'modified', area: 'unstaged' }]
        }
      ]
    }

    it('opens the clicked row worktree with absolute and relative paths', async () => {
      mockStoreState.worktreesByRepo = {
        r1: [{ id: childId }, { id: patternId }]
      }
      await act(async () => {
        root.render(<ProjectSourceControlScope project={mixedProject} />)
      })

      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="file-row-src/pattern.ts"]').click()
      })
      expect(mockStoreState.openDiff).toHaveBeenLastCalledWith(
        patternId,
        '/repos/loan-core/src/pattern.ts',
        'src/pattern.ts',
        'typescript',
        false
      )

      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="file-row-src/child.ts"]').click()
      })
      expect(mockStoreState.openDiff).toHaveBeenLastCalledWith(
        childId,
        '/workspaces/loan-core/child/src/child.ts',
        'src/child.ts',
        'typescript',
        true
      )
    })

    it('does nothing when the worktree is not in the store', async () => {
      mockStoreState.worktreesByRepo = {}
      await act(async () => {
        root.render(<ProjectSourceControlScope project={mixedProject} />)
      })
      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="file-row-src/pattern.ts"]').click()
      })
      expect(mockStoreState.openDiff).not.toHaveBeenCalled()
    })
  })

  it('dispatches commit only for target project', async () => {
    const onRefresh = vi.fn()
    await act(async () => {
      root.render(<ProjectSourceControlScope project={sampleProject} onRefresh={onRefresh} />)
    })

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')
    const commitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="commit-button-wt-billing-primary"]'
    )

    // Button disabled when empty
    expect(commitBtn.disabled).toBe(true)

    // Type commit message
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'fix: correct currency formatting' } })
    })

    expect(commitBtn.disabled).toBe(false)

    // Click commit
    await act(async () => {
      commitBtn.click()
    })

    // Dispatches commit strictly to target project's worktreePath
    expect(gitApi.lineageCommitProject).toHaveBeenCalledWith({
      worktreePath: '/workspaces/billing-service/feat-checkout',
      message: 'fix: correct currency formatting'
    })

    // Commit draft is cleared on success
    expect(textarea.value).toBe('')
    expect(onRefresh).toHaveBeenCalled()
  })

  describe('a repository with two worktrees', () => {
    const twoWorktrees: LineageProjectStatus = {
      repoName: 'loan-core',
      worktrees: [
        {
          worktreeId: 'r1::/w/one',
          worktreePath: '/w/one',
          branch: 'feat-one',
          dirtyFiles: [{ path: 'one.ts', status: 'modified', area: 'unstaged' }]
        },
        {
          worktreeId: 'r1::/w/two',
          worktreePath: '/w/two',
          branch: 'feat-two',
          dirtyFiles: [
            { path: 'two.ts', status: 'modified', area: 'unstaged' },
            { path: 'new.ts', status: 'untracked', area: 'untracked' }
          ]
        }
      ]
    }

    const scopeOf = (id: string): HTMLElement => {
      const el = container.querySelector<HTMLElement>(`[data-testid="worktree-scope-${id}"]`)
      if (!el) {
        throw new Error(`scope ${id} missing`)
      }
      return el
    }

    it('renders one sub-scope with its own branch header and commit box per worktree', async () => {
      await act(async () => {
        root.render(<ProjectSourceControlScope project={twoWorktrees} />)
      })
      expect(scopeOf('r1::/w/one').textContent).toContain('feat-one')
      expect(scopeOf('r1::/w/two').textContent).toContain('feat-two')
      expect(container.querySelectorAll('textarea')).toHaveLength(2)
    })

    it('discards a file of worktree #2 in worktree #2', async () => {
      await act(async () => {
        root.render(<ProjectSourceControlScope project={twoWorktrees} />)
      })
      const discard = scopeOf('r1::/w/two').querySelector<HTMLButtonElement>(
        '[data-testid="file-row-two.ts"] button[aria-label="Discard changes"]'
      )
      expect(discard).not.toBeNull()
      await act(async () => {
        discard?.click()
      })
      expect(gitApi.discard).toHaveBeenCalledWith({ worktreePath: '/w/two', filePath: 'two.ts' })
    })

    it('Discard All in Untracked discards only untracked files of that worktree', async () => {
      await act(async () => {
        root.render(<ProjectSourceControlScope project={twoWorktrees} />)
      })
      const buttons = scopeOf('r1::/w/two').querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Discard All"]'
      )
      expect(buttons).toHaveLength(2)
      await act(async () => {
        buttons[1].click()
      })
      expect(gitApi.bulkDiscard).toHaveBeenCalledWith({
        worktreePath: '/w/two',
        filePaths: ['new.ts']
      })
    })

    it('commits worktree #2 to its own path', async () => {
      await act(async () => {
        root.render(<ProjectSourceControlScope project={twoWorktrees} />)
      })
      const scope = scopeOf('r1::/w/two')
      const textarea = scope.querySelector('textarea')
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'feat: two' } })
      })
      await act(async () => {
        scope.querySelector<HTMLButtonElement>('[data-testid="commit-button-r1::/w/two"]')?.click()
      })
      expect(gitApi.lineageCommitProject).toHaveBeenCalledWith({
        worktreePath: '/w/two',
        message: 'feat: two'
      })
      expect(scopeOf('r1::/w/one').querySelector('textarea')?.value).toBe('')
    })

    it('shows unverifiable and no actions for a remote worktree', async () => {
      const remote: LineageProjectStatus = {
        repoName: 'api',
        worktrees: [
          {
            worktreeId: 'remote::/r/api',
            worktreePath: '/r/api',
            branch: 'feat',
            dirtyFiles: [],
            unverifiable: true
          }
        ]
      }
      await act(async () => {
        root.render(<ProjectSourceControlScope project={remote} />)
      })
      expect(container.querySelector('[data-testid="worktree-unverifiable"]')).not.toBeNull()
      expect(container.querySelector('textarea')).toBeNull()
    })
  })
})
