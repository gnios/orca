// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LineageSourceControl } from '../../../src/renderer/src/components/right-sidebar/source-control/lineage/LineageSourceControl'
import type { LineageGitStatusPayload } from '../../../src/shared/fleet-lineage-types'

const mockStoreState = {
  activeWorkspaceKey: 'folder:control-tower',
  folderWorkspaces: [{ id: 'control-tower', name: 'levgp-483 new loan' }],
  openDiff: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState)
}))

describe('LineageSourceControl', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders project collapsible accordion', async () => {
    const mockData: LineageGitStatusPayload = {
      parentKey: 'folder:control-tower',
      parentWorkspaceKey: 'folder:control-tower',
      totalDirtyFiles: 3,
      projects: {
        'billing-service': {
          repoName: 'billing-service',
          worktrees: [
            {
              worktreeId: 'wt-billing-1',
              worktreePath: '/workspaces/billing-service/feat-tax',
              branch: 'feat-tax',
              dirtyFiles: [
                { path: 'src/tax.ts', status: 'modified', area: 'staged' },
                { path: 'src/invoice.ts', status: 'modified', area: 'unstaged' }
              ]
            }
          ]
        },
        'auth-service': {
          repoName: 'auth-service',
          worktrees: [
            {
              worktreeId: 'wt-auth-1',
              worktreePath: '/workspaces/auth-service/feat-oauth',
              branch: 'feat-oauth',
              dirtyFiles: [{ path: 'src/jwt.ts', status: 'modified', area: 'unstaged' }]
            }
          ]
        }
      }
    }

    await act(async () => {
      root.render(
        <LineageSourceControl parentWorkspaceKey="folder:control-tower" initialData={mockData} />
      )
    })

    // Assert top-level collapsible accordions for both projects are present
    const billingAccordion = container.querySelector(
      '[data-testid="lineage-project-accordion-billing-service"]'
    )
    const authAccordion = container.querySelector(
      '[data-testid="lineage-project-accordion-auth-service"]'
    )

    expect(billingAccordion).not.toBeNull()
    expect(authAccordion).not.toBeNull()
    expect(container.textContent).toContain('billing-service')
    expect(container.textContent).toContain('auth-service')
  })

  it('opens Monaco diff in child worktree context', async () => {
    const onOpenFileDiff = vi.fn()
    const mockData: LineageGitStatusPayload = {
      parentKey: 'folder:control-tower',
      parentWorkspaceKey: 'folder:control-tower',
      totalDirtyFiles: 1,
      projects: {
        'billing-service': {
          repoName: 'billing-service',
          worktrees: [
            {
              worktreeId: 'wt-billing-child-101',
              worktreePath: '/workspaces/billing-service/feat-tax',
              branch: 'feat-tax',
              dirtyFiles: [{ path: 'src/calculator.ts', status: 'modified', area: 'unstaged' }]
            }
          ]
        }
      }
    }

    await act(async () => {
      root.render(
        <LineageSourceControl
          parentWorkspaceKey="folder:control-tower"
          initialData={mockData}
          onOpenFileDiff={onOpenFileDiff}
        />
      )
    })

    const fileRow = container.querySelector<HTMLElement>(
      '[data-testid="file-row-src/calculator.ts"]'
    )
    expect(fileRow).not.toBeNull()

    await act(async () => {
      fileRow.click()
    })

    // Must open diff in child worktree context (wt-billing-child-101)
    expect(onOpenFileDiff).toHaveBeenCalledWith('wt-billing-child-101', 'src/calculator.ts', false)
  })

  it('renders clean lineage state', async () => {
    const cleanData: LineageGitStatusPayload = {
      parentKey: 'folder:control-tower',
      parentWorkspaceKey: 'folder:control-tower',
      totalDirtyFiles: 0,
      projects: {
        'billing-service': {
          repoName: 'billing-service',
          worktrees: [
            {
              worktreeId: 'wt-billing-1',
              worktreePath: '/workspaces/billing-service/main',
              branch: 'main',
              dirtyFiles: []
            }
          ]
        }
      }
    }

    await act(async () => {
      root.render(
        <LineageSourceControl parentWorkspaceKey="folder:control-tower" initialData={cleanData} />
      )
    })

    expect(container.textContent).toContain('No changes across lineage worktrees')
  })

  it('sends the ticket key from the folder name when fetching status', async () => {
    const lineageGetStatus = vi.fn().mockResolvedValue({
      parentKey: 'folder:control-tower',
      parentWorkspaceKey: 'folder:control-tower',
      totalDirtyFiles: 0,
      projects: {}
    })
    Reflect.set(window, 'api', { git: { lineageGetStatus } })

    await act(async () => {
      root.render(<LineageSourceControl parentWorkspaceKey="folder:control-tower" />)
    })

    expect(lineageGetStatus).toHaveBeenCalledWith({
      parentWorkspaceKey: 'folder:control-tower',
      ticketKeys: ['LEVGP-483']
    })
    Reflect.deleteProperty(window, 'api')
  })

  describe('origin badge', () => {
    const payloadWith = (
      matchedBy: 'lineage' | 'pattern' | 'manual' | undefined,
      reason?: string[]
    ): LineageGitStatusPayload => ({
      parentKey: 'folder:control-tower',
      parentWorkspaceKey: 'folder:control-tower',
      totalDirtyFiles: 1,
      projects: {
        'billing-service': {
          repoName: 'billing-service',
          worktrees: [
            {
              worktreeId: 'wt-billing-1',
              worktreePath: '/workspaces/billing-service/feat-tax',
              branch: 'feat-tax',
              matchedBy,
              reason,
              dirtyFiles: [{ path: 'src/tax.ts', status: 'modified', area: 'unstaged' }]
            }
          ]
        }
      }
    })

    const renderPayload = async (payload: LineageGitStatusPayload): Promise<void> => {
      await act(async () => {
        root.render(
          <LineageSourceControl parentWorkspaceKey="folder:control-tower" initialData={payload} />
        )
      })
    }

    const badgeText = (): string | null | undefined =>
      container.querySelector('[data-testid="lineage-origin-badge"]')?.textContent

    it.each(['lineage', 'pattern', 'manual'] as const)(
      'shows the %s badge next to repo name and file count',
      async (origin) => {
        await renderPayload(payloadWith(origin))
        const trigger = container.querySelector('[data-testid="accordion-trigger-billing-service"]')
        expect(trigger?.textContent).toContain('billing-service')
        expect(trigger?.textContent).toContain('1')
        expect(trigger?.querySelector('[data-testid="lineage-origin-badge"]')?.textContent).toBe(
          origin
        )
      }
    )

    it('falls back to the lineage badge when matchedBy is absent', async () => {
      await renderPayload(payloadWith(undefined))
      expect(badgeText()).toBe('lineage')
    })

    it('lists the reasons in the badge tooltip', async () => {
      await renderPayload(payloadWith('pattern', ['branch matches LEVGP-483', 'path under /ws']))
      const badge = container.querySelector('[data-testid="lineage-origin-badge"]')
      if (!badge) {
        throw new Error('badge missing')
      }
      await act(async () => {
        fireEvent.focus(badge)
      })
      const tip = document.body.querySelector('[data-slot="tooltip-content"]')
      expect(tip?.textContent).toContain('branch matches LEVGP-483')
      expect(tip?.textContent).toContain('path under /ws')
    })

    it('hides the file rows when the header is collapsed', async () => {
      await renderPayload(payloadWith('manual'))
      expect(container.querySelector('[data-testid="file-row-src/tax.ts"]')).not.toBeNull()
      await act(async () => {
        const trigger = container.querySelector('[data-testid="accordion-trigger-billing-service"]')
        if (!trigger) {
          throw new Error('trigger missing')
        }
        fireEvent.click(trigger)
      })
      expect(container.querySelector('[data-testid="file-row-src/tax.ts"]')).toBeNull()
    })
  })
})
