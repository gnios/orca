// why: the popover renders through React DOM, so @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddManualPullRequest } from './AddManualPullRequest'

const originalApi = window.api
const addLink = vi.fn()
const onChanged = vi.fn()

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
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: originalApi
  })
})

function open(): HTMLInputElement {
  render(<AddManualPullRequest parentWorkspaceKey="tower" onChanged={onChanged} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add PR' }))
  const input = screen.getByPlaceholderText('https://github.com/org/repo/pull/12 or repo#12')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('expected an input element')
  }
  return input
}

describe('AddManualPullRequest', () => {
  it('submits the typed reference, then clears, closes, and notifies on success', async () => {
    addLink.mockResolvedValue({ success: true })
    const input = open()
    fireEvent.change(input, { target: { value: 'api#12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(addLink).toHaveBeenCalledWith({
        parentWorkspaceKey: 'tower',
        reference: 'api#12'
      })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('https://github.com/org/repo/pull/12 or repo#12')
      ).toBeNull()
    )
  })

  it('shows the returned error inline and keeps the input', async () => {
    addLink.mockResolvedValue({
      success: false,
      error: 'Repository not registered in Orca'
    })
    const input = open()
    fireEvent.change(input, { target: { value: 'nope#1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Repository not registered in Orca')).toBeInTheDocument()
    expect(input.value).toBe('nope#1')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('shows an error when the IPC call rejects', async () => {
    addLink.mockRejectedValue(new Error('boom'))
    const input = open()
    fireEvent.change(input, { target: { value: 'api#1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
