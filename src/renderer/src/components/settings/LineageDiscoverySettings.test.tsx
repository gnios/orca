// why: the section renders through React DOM, so @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LINEAGE_DISCOVERY } from '../../../../shared/lineage-discovery-types'
import type { Repo } from '../../../../shared/repo-types'
import { TooltipProvider } from '../ui/tooltip'
import { useAppStore } from '@/store'
import { LineageDiscoverySettings } from './LineageDiscoverySettings'

function makeRepo(id: string, displayName: string): Repo {
  return { id, displayName, path: `/${displayName}`, badgeColor: '#000', addedAt: 0 }
}

const originalApi = window.api
const testPattern = vi.fn()
const updateSettings = vi.fn()

function installGitApi(git: Record<string, unknown>): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { ...originalApi, git }
  })
}

function renderSection(lineageDiscovery = DEFAULT_LINEAGE_DISCOVERY): void {
  render(
    <TooltipProvider>
      <LineageDiscoverySettings settings={{ lineageDiscovery }} updateSettings={updateSettings} />
    </TooltipProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  testPattern.mockReset()
  updateSettings.mockReset()
  installGitApi({ lineageTestPattern: testPattern })
  useAppStore.setState({
    repos: [makeRepo('r1', 'api'), makeRepo('r2', 'web')]
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: originalApi
  })
})

describe('LineageDiscoverySettings', () => {
  it('persists the lineage and pattern switches through updateSettings', () => {
    renderSection()
    fireEvent.click(screen.getByRole('switch', { name: 'Follow workspace lineage' }))
    expect(updateSettings).toHaveBeenLastCalledWith({
      lineageDiscovery: { ...DEFAULT_LINEAGE_DISCOVERY, lineageEnabled: false }
    })
    fireEvent.click(screen.getByRole('switch', { name: 'Match by name pattern' }))
    expect(updateSettings).toHaveBeenLastCalledWith({
      lineageDiscovery: { ...DEFAULT_LINEAGE_DISCOVERY, patternEnabled: false }
    })
  })

  it('disables pattern-only fields when the pattern switch is off', () => {
    renderSection({ ...DEFAULT_LINEAGE_DISCOVERY, patternEnabled: false })
    expect(screen.getByLabelText('Key pattern')).toBeDisabled()
  })

  it('persists the match-on choice', () => {
    renderSection()
    fireEvent.click(screen.getByRole('radio', { name: 'Both' }))
    expect(updateSettings).toHaveBeenLastCalledWith({
      lineageDiscovery: { ...DEFAULT_LINEAGE_DISCOVERY, matchOn: 'both' }
    })
  })

  it('shows extracted keys for a tower name from lineageTestPattern', async () => {
    testPattern.mockResolvedValue({ keys: ['ABC-12'] })
    renderSection()
    fireEvent.change(screen.getByLabelText('Tower name'), {
      target: { value: 'g::abc-12' }
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(testPattern).toHaveBeenCalledWith({
      towerName: 'g::abc-12',
      keyRegex: DEFAULT_LINEAGE_DISCOVERY.keyRegex
    })
    await waitFor(() => expect(screen.getByTestId('lineage-test-keys')).toHaveTextContent('ABC-12'))
  })

  it('shows the returned error for an invalid regex and does not save it', async () => {
    testPattern.mockResolvedValue({
      keys: [],
      error: 'Invalid key pattern, using the default: ('
    })
    renderSection()
    fireEvent.change(screen.getByLabelText('Key pattern'), {
      target: { value: '(' }
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await waitFor(() =>
      expect(screen.getByTestId('lineage-key-regex-error')).toHaveTextContent('Invalid key pattern')
    )
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('treats an empty regex as invalid and does not save it', async () => {
    renderSection()
    fireEvent.change(screen.getByLabelText('Key pattern'), {
      target: { value: '' }
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.getByTestId('lineage-key-regex-error')).toBeInTheDocument()
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('saves a valid regex', async () => {
    testPattern.mockResolvedValue({ keys: [] })
    renderSection()
    fireEvent.change(screen.getByLabelText('Key pattern'), {
      target: { value: 'ZZ-\\d+' }
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        lineageDiscovery: { ...DEFAULT_LINEAGE_DISCOVERY, keyRegex: 'ZZ-\\d+' }
      })
    )
  })

  it('offers a repo checklist when selected repositories is chosen', () => {
    renderSection()
    fireEvent.click(screen.getByRole('radio', { name: 'Selected repositories' }))
    expect(updateSettings).toHaveBeenLastCalledWith({
      lineageDiscovery: { ...DEFAULT_LINEAGE_DISCOVERY, repoScope: [] }
    })
  })

  it('toggles a repo in the selected scope', () => {
    renderSection({ ...DEFAULT_LINEAGE_DISCOVERY, repoScope: ['r1'] })
    fireEvent.click(screen.getByLabelText('web'))
    expect(updateSettings).toHaveBeenLastCalledWith({
      lineageDiscovery: {
        ...DEFAULT_LINEAGE_DISCOVERY,
        repoScope: ['r1', 'r2']
      }
    })
  })

  it('hides the live test and does not reject when lineage IPC is unsupported', async () => {
    installGitApi({
      lineageTestPattern: () => Promise.reject(new Error('Fleet lineage is not supported'))
    })
    renderSection()
    fireEvent.change(screen.getByLabelText('Tower name'), {
      target: { value: 'g::abc-12' }
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.queryByLabelText('Tower name')).toBeNull()
  })

  it('hides the live test when the IPC method is missing', () => {
    installGitApi({})
    renderSection()
    expect(screen.queryByLabelText('Tower name')).toBeNull()
  })
})
