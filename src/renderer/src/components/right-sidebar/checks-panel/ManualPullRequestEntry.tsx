import React, { createContext, useContext, useState } from 'react'
import { Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { AddManualPullRequestForm } from '../lineage-members/AddManualPullRequest'

export type ManualPullRequestEntryValue = {
  parentWorkspaceKey: string
  onChanged: () => void
}

/** Provided by ChecksPanel only on the single-panel path while lineage IPC is supported. */
export const ManualPullRequestEntryContext = createContext<ManualPullRequestEntryValue | null>(null)

const LABEL_KEY = 'auto.components.rightSidebar.lineageMembers.linkPullRequestElsewhere'
const LABEL = 'Link pull request from another repository…'

export function ManualPullRequestDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element | null {
  const entry = useContext(ManualPullRequestEntryContext)
  if (!entry) {
    return null
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{translate(LABEL_KEY, LABEL)}</DialogTitle>
        </DialogHeader>
        <AddManualPullRequestForm
          parentWorkspaceKey={entry.parentWorkspaceKey}
          onChanged={entry.onChanged}
          onAdded={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

export function ManualPullRequestMenuItem({
  onOpen
}: {
  onOpen: () => void
}): React.JSX.Element | null {
  if (!useContext(ManualPullRequestEntryContext)) {
    return null
  }
  return (
    <DropdownMenuItem onSelect={onOpen}>
      <Link className="size-3.5" />
      {translate(LABEL_KEY, LABEL)}
    </DropdownMenuItem>
  )
}

/** Entry point for the no-review empty state, which has no header menu. */
export function ManualPullRequestEmptyAction(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!useContext(ManualPullRequestEntryContext)) {
    return null
  }
  return (
    <>
      <Button size="xs" variant="ghost" className="mt-3" onClick={() => setOpen(true)}>
        <Link className="size-3.5" />
        {translate(LABEL_KEY, LABEL)}
      </Button>
      <ManualPullRequestDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
