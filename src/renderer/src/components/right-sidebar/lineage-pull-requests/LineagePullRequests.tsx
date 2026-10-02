import React, { useState, useMemo } from 'react'
import {
  GitPullRequest,
  ChevronDown,
  ChevronRight,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  User,
  ExternalLink,
  FolderGit2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type {
  LineagePullRequest,
  LineagePullRequestReviewer
} from '../../../../../../shared/fleet-lineage-types'

export interface LineagePullRequestsProps {
  pullRequests?: LineagePullRequest[]
  onOpenPullRequest?: (pr: LineagePullRequest) => void
}

function renderCiBadge(status?: string) {
  switch (status?.toLowerCase()) {
    case 'success':
    case 'passed':
      return (
        <Badge
          variant="outline"
          className="text-[10px] h-4 px-1.5 gap-1 text-green-500 border-green-500/30 bg-green-500/10"
          data-testid="ci-badge-success"
        >
          <CheckCircle2 className="h-3 w-3" />
          Passed
        </Badge>
      )
    case 'failure':
    case 'failed':
      return (
        <Badge
          variant="outline"
          className="text-[10px] h-4 px-1.5 gap-1 text-red-500 border-red-500/30 bg-red-500/10"
          data-testid="ci-badge-failure"
        >
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
    case 'running':
    case 'pending':
      return (
        <Badge
          variant="outline"
          className="text-[10px] h-4 px-1.5 gap-1 text-amber-500 border-amber-500/30 bg-amber-500/10"
          data-testid="ci-badge-running"
        >
          <Clock className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      )
    default:
      return null
  }
}

export function LineagePullRequests({
  pullRequests = [],
  onOpenPullRequest
}: LineagePullRequestsProps): React.JSX.Element {
  // Group pull requests by project/repository (repoName) (AC 15 / C15)
  const groupedPrs = useMemo(() => {
    const map = new Map<string, LineagePullRequest[]>()
    for (const pr of pullRequests) {
      const repo = pr.repoName || 'Other'
      if (!map.has(repo)) {
        map.set(repo, [])
      }
      map.get(repo)!.push(pr)
    }
    return map
  }, [pullRequests])

  // Track collapsed status per project
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const toggleSection = (repoName: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [repoName]: prev[repoName] === undefined ? false : !prev[repoName]
    }))
  }

  if (pullRequests.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground"
        data-testid="empty-lineage-prs"
      >
        <GitPullRequest className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <div className="text-xs font-medium text-foreground mb-1">No pull requests found</div>
        <div className="text-[11px] text-muted-foreground">
          No open pull requests associated with child lineage worktrees.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto text-xs" data-testid="lineage-pull-requests">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/50 sticky top-0 z-10">
        <div className="flex items-center gap-1.5 font-medium">
          <GitPullRequest className="h-3.5 w-3.5 text-primary" />
          <span>Lineage Pull Requests</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
            {pullRequests.length}
          </Badge>
        </div>
      </div>

      {/* Grouped Collapsible Blocks per Project / Repository */}
      <div className="flex flex-col divide-y divide-border/40">
        {Array.from(groupedPrs.entries()).map(([repoName, prList]) => {
          const isOpen = openSections[repoName] ?? true
          return (
            <div
              key={repoName}
              className="flex flex-col"
              data-testid={`lineage-pr-project-group-${repoName}`}
            >
              {/* Project Collapsible Header */}
              <button
                type="button"
                className="flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => toggleSection(repoName)}
                aria-expanded={isOpen}
                data-testid={`pr-project-trigger-${repoName}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  )}
                  <FolderGit2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate">{repoName}</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-muted/40">
                  {prList.length} {prList.length === 1 ? 'PR' : 'PRs'}
                </Badge>
              </button>

              {/* PR Cards List */}
              {isOpen && (
                <div className="flex flex-col gap-2 p-3 bg-muted/20 border-t border-border/30">
                  {prList.map((pr) => {
                    const branchName = pr.branch || pr.sourceBranch || 'main'
                    return (
                      <Card
                        key={pr.id ?? pr.number}
                        className="border border-border/50 shadow-xs hover:border-primary/40 transition-colors cursor-pointer bg-background"
                        onClick={() => onOpenPullRequest?.(pr)}
                        data-testid={`pr-card-${pr.number}`}
                      >
                        <CardContent className="p-3 flex flex-col gap-2">
                          {/* Title and PR Number */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-foreground text-xs leading-tight line-clamp-2">
                              <span className="text-muted-foreground mr-1.5 font-normal">
                                #{pr.number}
                              </span>
                              {pr.title}
                            </div>
                            {pr.url && (
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                          </div>

                          {/* Branch and CI Status Badges */}
                          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] pt-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <GitBranch className="h-3 w-3 shrink-0" />
                              <span
                                className="font-mono text-[10px] truncate max-w-[140px]"
                                data-testid={`pr-branch-${pr.number}`}
                              >
                                {branchName}
                              </span>
                            </div>

                            {/* CI Badge */}
                            {renderCiBadge(pr.ciStatus)}
                          </div>

                          {/* Reviewers */}
                          {pr.reviewers && pr.reviewers.length > 0 && (
                            <div
                              className="flex items-center gap-1 pt-1 border-t border-border/30 text-[11px] text-muted-foreground flex-wrap"
                              data-testid={`pr-reviewers-${pr.number}`}
                            >
                              <span className="text-[10px]">Reviewers:</span>
                              {pr.reviewers.map((reviewer, idx) => {
                                const reviewerName =
                                  typeof reviewer === 'string' ? reviewer : reviewer.name
                                return (
                                  <Badge
                                    key={idx}
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1.5 gap-1 font-normal"
                                  >
                                    <User className="h-2.5 w-2.5" />
                                    {reviewerName}
                                  </Badge>
                                )
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default LineagePullRequests
