import { ipcMain } from 'electron'
import type {
  AttachToParentArgs,
  AttachToParentResult,
  NotifyWorktreeCreatedArgs,
  NotifyWorktreeCreatedResult,
  LineageCommitProjectArgs,
  LineageCommitProjectResult,
  LineageGitStatusPayload,
  LineageGetFileDiffArgs,
  LineageGetFileDiffResult
} from '../../shared/fleet-lineage-types'
import {
  attachWorkspaceToParent,
  notifyWorktreeCreated,
  type LineageStoreContract
} from '../lineage/workspace-lineage-service'
import {
  getLineageStatus,
  commitLineageProject,
  getLineageFileDiff
} from '../lineage/lineage-git-status-service'

export function registerLineageIpcHandlers(store: LineageStoreContract): void {
  ipcMain.removeHandler('workspace:attach-to-parent')
  ipcMain.handle(
    'workspace:attach-to-parent',
    async (_event, args: AttachToParentArgs): Promise<AttachToParentResult> => {
      return attachWorkspaceToParent(store, args)
    }
  )

  ipcMain.removeHandler('workspace:notify-worktree-created')
  ipcMain.handle(
    'workspace:notify-worktree-created',
    async (_event, args: NotifyWorktreeCreatedArgs): Promise<NotifyWorktreeCreatedResult> => {
      return notifyWorktreeCreated(store, args)
    }
  )

  ipcMain.removeHandler('git:lineage-get-status')
  ipcMain.handle(
    'git:lineage-get-status',
    async (_event, args: { parentWorkspaceKey: string }): Promise<LineageGitStatusPayload> => {
      return getLineageStatus(store, args.parentWorkspaceKey)
    }
  )

  ipcMain.removeHandler('git:lineage-commit-project')
  ipcMain.handle(
    'git:lineage-commit-project',
    async (_event, args: LineageCommitProjectArgs): Promise<LineageCommitProjectResult> => {
      return commitLineageProject(store, args)
    }
  )

  ipcMain.removeHandler('git:lineage-get-file-diff')
  ipcMain.handle(
    'git:lineage-get-file-diff',
    async (_event, args: LineageGetFileDiffArgs): Promise<LineageGetFileDiffResult> => {
      return getLineageFileDiff(args, {
        resolveWorktreePath: (id: string) => {
          const anyStore = store as any
          if (typeof anyStore.getWorktree === 'function') {
            return anyStore.getWorktree(id)?.path
          }
          return undefined
        }
      })
    }
  )
}
