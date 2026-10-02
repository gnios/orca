// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LineagePullRequests } from '../../../src/renderer/src/components/right-sidebar/lineage-pull-requests/LineagePullRequests'
import type { LineagePullRequest } from '../../../src/shared/fleet-lineage-types'

describe('LineagePullRequests', () => {
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

  const samplePrs: LineagePullRequest[] = [
    {
      id: 'pr-101',
      number: 101,
      title: 'feat: implement stripe webhook handling',
      branch: 'feat/stripe-webhook',
      repoName: 'billing-service',
      ciStatus: 'success',
      reviewers: ['alice', 'charlie']
    },
    {
      id: 'pr-102',
      number: 102,
      title: 'fix: validate oauth state token',
      branch: 'fix/oauth-token',
      repoName: 'auth-service',
      ciStatus: 'failure',
      reviewers: [{ name: 'bob' }]
    }
  ]

  it('groups PRs by project', async () => {
    await act(async () => {
      root.render(<LineagePullRequests pullRequests={samplePrs} />)
    })

    const billingGroup = container.querySelector('[data-testid="lineage-pr-project-group-billing-service"]')
    const authGroup = container.querySelector('[data-testid="lineage-pr-project-group-auth-service"]')

    expect(billingGroup).not.toBeNull()
    expect(authGroup).not.toBeNull()

    // Accordion headers show repo names and counts
    expect(billingGroup?.textContent).toContain('billing-service')
    expect(billingGroup?.textContent).toContain('1 PR')
    expect(authGroup?.textContent).toContain('auth-service')
    expect(authGroup?.textContent).toContain('1 PR')
  })

  it('renders PR card with CI badges and branch', async () => {
    await act(async () => {
      root.render(<LineagePullRequests pullRequests={samplePrs} />)
    })

    // PR #101
    const prCard101 = container.querySelector('[data-testid="pr-card-101"]')
    expect(prCard101).not.toBeNull()
    expect(prCard101?.textContent).toContain('#101')
    expect(prCard101?.textContent).toContain('feat: implement stripe webhook handling')

    const branch101 = container.querySelector('[data-testid="pr-branch-101"]')
    expect(branch101?.textContent).toContain('feat/stripe-webhook')

    const ciBadgeSuccess = prCard101?.querySelector('[data-testid="ci-badge-success"]')
    expect(ciBadgeSuccess).not.toBeNull()
    expect(ciBadgeSuccess?.textContent).toContain('Passed')

    const reviewers101 = container.querySelector('[data-testid="pr-reviewers-101"]')
    expect(reviewers101?.textContent).toContain('alice')
    expect(reviewers101?.textContent).toContain('charlie')

    // PR #102
    const prCard102 = container.querySelector('[data-testid="pr-card-102"]')
    expect(prCard102).not.toBeNull()
    expect(prCard102?.textContent).toContain('#102')

    const ciBadgeFailure = prCard102?.querySelector('[data-testid="ci-badge-failure"]')
    expect(ciBadgeFailure).not.toBeNull()
    expect(ciBadgeFailure?.textContent).toContain('Failed')

    const reviewers102 = container.querySelector('[data-testid="pr-reviewers-102"]')
    expect(reviewers102?.textContent).toContain('bob')
  })
})
