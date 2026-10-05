import React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type RemoveManualPullRequestButtonProps = {
  parentWorkspaceKey: string
  linkId: string
  label: string
  onChanged: () => void
}

export function RemoveManualPullRequestButton({
  parentWorkspaceKey,
  linkId,
  label,
  onChanged
}: RemoveManualPullRequestButtonProps): React.JSX.Element {
  const title = `${translate('auto.components.rightSidebar.lineageMembers.removePullRequest', 'Remove')} ${label}`
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={title}
      title={title}
      onClick={() => {
        void window.api.git
          .lineageRemoveManualLink({ parentWorkspaceKey, linkId })
          .then(onChanged)
          .catch(() => {})
      }}
    >
      <X className="size-3.5" />
    </Button>
  )
}
