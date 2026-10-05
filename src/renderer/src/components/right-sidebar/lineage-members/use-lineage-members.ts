import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import type { LineageMember } from '../../../../../shared/lineage-discovery-types'

type LineageMembersState = {
  key: string | null
  members: LineageMember[]
  supported: boolean
}

export type UseLineageMembersResult = {
  members: LineageMember[]
  loading: boolean
  supported: boolean
  refresh: () => Promise<void>
}

const NO_MEMBERS: LineageMember[] = []

export function useLineageMembers(parentWorkspaceKey: string | null): UseLineageMembersResult {
  const workspaceLineageByChildKey = useAppStore((s) => s.workspaceLineageByChildKey)
  const [state, setState] = useState<LineageMembersState>({
    key: null,
    members: NO_MEMBERS,
    supported: false
  })
  const [loading, setLoading] = useState(false)
  const requestSeqRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const requestSeq = ++requestSeqRef.current
    const getMembers = window.api?.git?.lineageGetMembers
    if (!parentWorkspaceKey || typeof getMembers !== 'function') {
      setState({
        key: parentWorkspaceKey,
        members: NO_MEMBERS,
        supported: false
      })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await getMembers({ parentWorkspaceKey })
      if (requestSeq === requestSeqRef.current) {
        setState({
          key: parentWorkspaceKey,
          members: result?.members ?? NO_MEMBERS,
          supported: true
        })
      }
    } catch {
      // why: older hosts have no lineage handler; the caller falls back to the single panel silently
      if (requestSeq === requestSeqRef.current) {
        setState({
          key: parentWorkspaceKey,
          members: NO_MEMBERS,
          supported: false
        })
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [parentWorkspaceKey])

  useEffect(() => {
    void refresh()
  }, [refresh, workspaceLineageByChildKey])

  // invariant: members fetched for a previous workspace are never shown for the current one
  const isCurrent = state.key === parentWorkspaceKey
  return {
    members: isCurrent ? state.members : NO_MEMBERS,
    loading,
    supported: isCurrent && state.supported,
    refresh
  }
}
