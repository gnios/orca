import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { extractTicketKeys } from '../../../../../../shared/lineage-ticket-keys'

/** Ticket keys carried by a folder workspace's name; the folder key itself is an opaque id. */
export function useLineageTicketKeys(workspaceKey: string | null | undefined): string[] {
  const nameOrPath = useAppStore((s) => {
    if (!workspaceKey) {
      return undefined
    }
    if (workspaceKey.startsWith('folder:')) {
      return s.folderWorkspaces?.find((folder) => `folder:${folder.id}` === workspaceKey)?.name
    }
    if (workspaceKey.startsWith('worktree:')) {
      const parts = workspaceKey.split('::')
      const repoId = parts[0].slice('worktree:'.length)
      const wtPath = parts.slice(1).join('::')
      const branch = s.worktreesByRepo?.[repoId]?.find((wt) => wt.path === wtPath)?.branch
      return [wtPath, branch].filter(Boolean).join(' ')
    }
    return undefined
  })
  return useMemo(() => (nameOrPath ? extractTicketKeys(nameOrPath) : []), [nameOrPath])
}
