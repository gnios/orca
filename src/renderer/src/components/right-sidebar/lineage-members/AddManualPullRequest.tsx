import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'

type AddManualPullRequestProps = {
  parentWorkspaceKey: string
  onChanged: () => void
}

export function AddManualPullRequest({
  parentWorkspaceKey,
  onChanged
}: AddManualPullRequestProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    const trimmed = reference.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.api.git.lineageAddManualLink({
        parentWorkspaceKey,
        reference: trimmed
      })
      if (result.success) {
        setReference('')
        setOpen(false)
        onChanged()
      } else {
        setError(
          result.error ??
            translate(
              'auto.components.rightSidebar.lineageMembers.addPullRequestFailed',
              'Could not add the pull request'
            )
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setError(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          <Plus className="size-3.5" />
          {translate('auto.components.rightSidebar.lineageMembers.addPullRequest', 'Add PR')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            autoFocus
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder={translate(
              'auto.components.rightSidebar.lineageMembers.addPullRequestPlaceholder',
              'https://github.com/org/repo/pull/12 or repo#12'
            )}
            aria-invalid={error !== null}
          />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={submitting || reference.trim() === ''}>
            {translate('auto.components.rightSidebar.lineageMembers.addPullRequestSubmit', 'Add')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
