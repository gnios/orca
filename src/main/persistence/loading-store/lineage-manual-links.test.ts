import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeTestStores,
  createStore,
  testState,
  writeDataFile
} from '../../persistence-test-harness'
import { DEFAULT_LINEAGE_DISCOVERY } from '../../../shared/lineage-discovery-types'
import { normalizeManualLinks } from './normalize-loaded-profile-state'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

const PARENT = 'worktree:r1::/w/a'

describe('lineage manual links and discovery settings persistence', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
  })

  afterEach(async () => {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('round-trips manual links per parent workspace key', async () => {
    const store = await createStore()
    const link = { id: 'l1', repoName: 'loan-core', number: 12, addedAt: 1 }
    store.setLineageManualLinks(PARENT, [link])
    store.flush()

    const reloaded = await createStore()
    expect(reloaded.getLineageManualLinks(PARENT)).toEqual([link])
    expect(reloaded.getLineageManualLinks('worktree:r1::/w/none')).toEqual([])
  })

  it('removes the entry when links are cleared', async () => {
    const store = await createStore()
    store.setLineageManualLinks(PARENT, [{ id: 'l1', repoName: 'a', number: 1, addedAt: 1 }])
    store.setLineageManualLinks(PARENT, [])
    store.flush()

    const reloaded = await createStore()
    expect(reloaded.getLineageManualLinks(PARENT)).toEqual([])
  })

  it('loads a profile without the field as empty and drops malformed links', async () => {
    const store = await createStore()
    store.flush()
    expect((await createStore()).getLineageManualLinks(PARENT)).toEqual([])

    const good = { id: 'ok', repoName: 'r', number: 3, addedAt: 2 }
    writeDataFile({
      lineageManualLinksByParentKey: {
        [PARENT]: [
          good,
          { id: 1, repoName: 'r', number: 3 },
          { id: 'x', repoName: 'r', number: 0 }
        ],
        'not-an-array': 'bad'
      }
    })
    const reloaded = await createStore()
    expect(reloaded.getLineageManualLinks(PARENT)).toEqual([good])
  })

  it('drops entries whose parent key is not a workspace key', () => {
    const link = { id: 'ok', repoName: 'r', number: 3, addedAt: 2 }
    expect(
      normalizeManualLinks({
        [PARENT]: [link],
        'folder:f1': [link],
        'r1::/w/a': [link],
        'worktree:': [link],
        bogus: [link]
      })
    ).toEqual({ [PARENT]: [link], 'folder:f1': [link] })
  })

  it('defaults and persists lineageDiscovery settings', async () => {
    const store = await createStore()
    expect(store.getSettings().lineageDiscovery).toEqual(DEFAULT_LINEAGE_DISCOVERY)
    store.updateSettings({
      lineageDiscovery: {
        ...DEFAULT_LINEAGE_DISCOVERY,
        repoScope: ['loan-core']
      }
    })
    store.flush()

    const reloaded = await createStore()
    expect(reloaded.getSettings().lineageDiscovery?.repoScope).toEqual(['loan-core'])
  })
})
