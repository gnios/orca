// why: the entry points render through React DOM, so @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  ManualPullRequestDialog,
  ManualPullRequestEmptyAction,
  ManualPullRequestEntryContext,
  ManualPullRequestMenuItem
} from './ManualPullRequestEntry'
import { useState } from 'react'

const originalApi = window.api
const addLink = vi.fn()
const onChanged = vi.fn()
const PLACEHOLDER = 'https://github.com/org/repo/pull/12 or repo#12'
const LABEL = 'Link pull request from another repository…'

function MenuHarness(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ManualPullRequestMenuItem onOpen={() => setOpen(true)} />
        </DropdownMenuContent>
      </DropdownMenu>
      <ManualPullRequestDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

const enabledEntry = { parentWorkspaceKey: 'tower', onChanged }

function withEntry(ui: React.ReactNode, enabled: boolean): React.JSX.Element {
  return (
    <ManualPullRequestEntryContext.Provider value={enabled ? enabledEntry : null}>
      {ui}
    </ManualPullRequestEntryContext.Provider>
  )
}

beforeEach(() => {
  addLink.mockReset()
  onChanged.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { ...originalApi, git: { lineageAddManualLink: addLink } }
  })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'api', { configurable: true, writable: true, value: originalApi })
})

describe('ManualPullRequestEntry', () => {
  it('shows the menu item when supported and opens the add flow, then refreshes on success', async () => {
    addLink.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(withEntry(<MenuHarness />, true))
    await user.click(screen.getByText('menu'))
    await user.click(await screen.findByText(LABEL))
    const input = await screen.findByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, { target: { value: 'api#12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(addLink).toHaveBeenCalledWith({ parentWorkspaceKey: 'tower', reference: 'api#12' })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull())
  })

  it('renders no menu item when lineage is unsupported', async () => {
    const user = userEvent.setup()
    render(withEntry(<MenuHarness />, false))
    await user.click(screen.getByText('menu'))
    await screen.findByRole('menu')
    expect(screen.queryByText(LABEL)).toBeNull()
  })

  it('offers the empty-state action only when supported', () => {
    const { unmount } = render(withEntry(<ManualPullRequestEmptyAction />, true))
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument()
    unmount()
    const { container } = render(withEntry(<ManualPullRequestEmptyAction />, false))
    expect(container).toBeEmptyDOMElement()
  })
})
