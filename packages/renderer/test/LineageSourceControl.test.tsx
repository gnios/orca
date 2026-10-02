// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LineageSourceControl } from '../../../src/renderer/src/components/right-sidebar/source-control/lineage/LineageSourceControl'
import type { LineageGitStatusPayload } from '../../../src/shared/fleet-lineage-types'

const mockStoreState = {
  activeWorkspaceKey: 'folder:control-tower',
  openDiff: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: (selector: any) => selector(mockStoreState)
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
                { path: 'src/tax.ts', status: 'M', area: 'staged' },
                { path: 'src/invoice.ts', status: 'M', area: 'unstaged' }
              ] as any
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
              dirtyFiles: [
                { path: 'src/jwt.ts', status: 'M', area: 'unstaged' }
              ] as any
            }
          ]
        }
      }
    }

    await act(async () => {
      root.render(<LineageSourceControl parentWorkspaceKey="folder:control-tower" initialData={mockData} />)
    })

    // Assert top-level collapsible accordions for both projects are present
    const billingAccordion = container.querySelector('[data-testid="lineage-project-accordion-billing-service"]')
    const authAccordion = container.querySelector('[data-testid="lineage-project-accordion-auth-service"]')

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
              dirtyFiles: [
                { path: 'src/calculator.ts', status: 'M', area: 'unstaged' }
              ] as any
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

    const fileRow = container.querySelector('[data-testid="file-row-src/calculator.ts"]') as HTMLElement
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
      root.render(<LineageSourceControl parentWorkspaceKey="folder:control-tower" initialData={cleanData} />)
    })

    expect(container.textContent).toContain('No changes across lineage worktrees')
  })
})
