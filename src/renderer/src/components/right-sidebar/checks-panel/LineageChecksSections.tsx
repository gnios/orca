import React, { useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, FolderGit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { TooltipProvider } from '@/components/ui/tooltip'
import { openHttpLink } from '@/lib/http-link-routing'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/selectors'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { LineageMember } from '../../../../../shared/lineage-discovery-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { LineageOriginBadge } from '../lineage-origin-badge'
import { ChecksPanelTargetProvider } from './checks-panel-target-worktree'

type LineageChecksSectionsProps = {
  members: LineageMember[]
  /** The original single-worktree Checks panel, rendered once per member worktree. */
  PanelComponent: React.ComponentType
}

type ResolvedMember = { member: LineageMember; worktree: Worktree | null }
type RepoGroup = {
  repoName: string
  entries: ResolvedMember[]
  hasWorktree: boolean
}

function groupByRepo(
  members: LineageMember[],
  resolveWorktree: (member: LineageMember) => Worktree | null
): RepoGroup[] {
  const groups = new Map<string, RepoGroup>()
  for (const member of members) {
    const worktree = resolveWorktree(member)
    const group = groups.get(member.repoName) ?? {
      repoName: member.repoName,
      entries: [],
      hasWorktree: false
    }
    group.entries.push({ member, worktree })
    group.hasWorktree = group.hasWorktree || worktree !== null
    groups.set(member.repoName, group)
  }
  return [...groups.values()]
}

function pullRequestLabel(member: LineageMember): string {
  return member.pr ? `${member.repoName}#${member.pr.number}` : member.repoName
}

function LineagePullRequestRow({ member }: { member: LineageMember }): React.JSX.Element {
  const label = pullRequestLabel(member)
  const url = member.pr?.url
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 px-3 py-1.5 text-xs"
      data-testid={`lineage-checks-pr-row-${member.repoName}-${member.pr?.number ?? member.branch}`}
    >
      <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-foreground" title={label}>
        {member.pr?.title ?? label}
      </span>
      <LineageOriginBadge matchedBy={member.matchedBy} reasons={member.reasons} />
      <div className="flex-1" />
      {url ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Open ${label}`}
          title={`Open ${label}`}
          onClick={() => openHttpLink(url)}
        >
          <ExternalLink className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function LineageChecksSection({
  group,
  isOpen,
  onOpenChange,
  PanelComponent
}: {
  group: RepoGroup
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  PanelComponent: React.ComponentType
}): React.JSX.Element {
  const lead = group.entries.find((entry) => entry.worktree !== null) ?? group.entries[0]
  const prNumber = group.entries.find((entry) => entry.member.pr)?.member.pr?.number
  const worktreeCount = group.entries.filter((entry) => entry.worktree !== null).length
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="flex flex-col"
      data-testid={`lineage-checks-section-${group.repoName}`}
    >
      <div className="pl-1 pr-3 pt-1.5 pb-1">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-full justify-start text-left"
          >
            <span className="flex min-w-0 flex-1 items-center gap-x-1.5 font-semibold">
              <ChevronDown
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform',
                  !isOpen && '-rotate-90'
                )}
              />
              <FolderGit2 className="size-4 shrink-0 text-primary" />
              <span className="truncate text-xs font-semibold" title={group.repoName}>
                {group.repoName}
              </span>
              <LineageOriginBadge matchedBy={lead.member.matchedBy} reasons={lead.member.reasons} />
              {lead.member.branch ? (
                <span className="truncate text-[11px] font-normal text-muted-foreground">
                  ({lead.member.branch})
                </span>
              ) : null}
              {prNumber !== undefined ? (
                <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                  #{prNumber}
                </span>
              ) : null}
            </span>
          </Button>
        </CollapsibleTrigger>
      </div>
      {/* invariant: Radix unmounts closed content, so a collapsed section runs no panel fetches or polling */}
      <CollapsibleContent className="flex flex-col">
        {group.entries.map(({ member, worktree }) =>
          worktree ? (
            <div key={worktree.id} className="flex flex-col">
              {worktreeCount > 1 ? (
                <div className="px-4 pt-1 text-[11px] text-muted-foreground">{member.branch}</div>
              ) : null}
              <ChecksPanelTargetProvider worktree={worktree} isActive={isOpen}>
                <PanelComponent />
              </ChecksPanelTargetProvider>
            </div>
          ) : (
            <LineagePullRequestRow key={pullRequestLabel(member)} member={member} />
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function LineageChecksSections({
  members,
  PanelComponent
}: LineageChecksSectionsProps): React.JSX.Element {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const allWorktrees = useAllWorktrees()
  const [openByRepo, setOpenByRepo] = useState<Record<string, boolean>>({})

  const groups = useMemo(
    () =>
      groupByRepo(members, (member) => {
        const byId = member.worktreeId
          ? findWorktreeById(worktreesByRepo, member.worktreeId)
          : undefined
        const byPath = member.worktreePath
          ? allWorktrees.find((worktree) => worktree.path === member.worktreePath)
          : undefined
        return byId ?? byPath ?? null
      }),
    [allWorktrees, members, worktreesByRepo]
  )
  const firstSectionRepo = groups.find((group) => group.hasWorktree)?.repoName

  return (
    <TooltipProvider>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-sleek"
        data-testid="lineage-checks-sections"
      >
        <div className="flex flex-col divide-y divide-border/40">
          {groups.map((group) =>
            group.hasWorktree ? (
              <LineageChecksSection
                key={group.repoName}
                group={group}
                isOpen={openByRepo[group.repoName] ?? group.repoName === firstSectionRepo}
                onOpenChange={(open) =>
                  setOpenByRepo((current) => ({
                    ...current,
                    [group.repoName]: open
                  }))
                }
                PanelComponent={PanelComponent}
              />
            ) : (
              group.entries.map(({ member }) => (
                <LineagePullRequestRow key={pullRequestLabel(member)} member={member} />
              ))
            )
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
