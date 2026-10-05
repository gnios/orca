import { useEffect, useRef } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { useAppStore } from '@/store'
import { useSourceControlTargetWorktree } from '../panel/source-control-target-worktree'

const TARGET_STATUS_INTERVAL_MS = 10_000

/**
 * Keeps git status fresh for a worktree pinned by a lineage section. The app-wide poller only
 * covers the active worktree, so a pinned sibling would otherwise show whatever was last cached.
 */
export function useSourceControlTargetStatusPoll({
  activeConnectionId,
  isBranchVisible,
  refreshActiveGitStatus
}: {
  activeConnectionId: string | null
  isBranchVisible: boolean
  refreshActiveGitStatus: () => Promise<void>
}): void {
  const target = useSourceControlTargetWorktree()
  const storeActiveWorktreeId = useAppStore((s) => s.activeWorktreeId)
  // why: loss of an SSH connection is not evidence the worktree changed; skip until it is back
  const connectionReady = useAppStore(
    (s) =>
      !activeConnectionId || s.sshConnectionStates.get(activeConnectionId)?.status === 'connected'
  )
  const targetWorktreeId = target?.worktree?.id ?? null
  const enabled =
    targetWorktreeId !== null &&
    targetWorktreeId !== storeActiveWorktreeId &&
    isBranchVisible &&
    connectionReady
  const refreshRef = useRef(refreshActiveGitStatus)
  refreshRef.current = refreshActiveGitStatus

  useEffect(() => {
    if (!enabled) {
      return
    }
    return installWindowVisibilityInterval({
      run: () => {
        void refreshRef.current().catch((error) => {
          console.warn('[SourceControl] lineage member git status refresh failed', error)
        })
      },
      intervalMs: TARGET_STATUS_INTERVAL_MS
    })
  }, [enabled, targetWorktreeId])
}
