export type ParsedPullRequestReference = { repoName: string; number: number; url?: string }

const GITHUB_PR = /^https?:\/\/[^/]+\/[^/]+\/([^/]+)\/pull\/(\d+)\/?$/
const GITLAB_MR = /^https?:\/\/[^/]+\/(?:[^/]+\/)+([^/]+)\/-\/merge_requests\/(\d+)\/?$/
const SHORT_REF = /^([A-Za-z0-9._-]+)#(\d+)$/

export function parsePullRequestReference(input: string): ParsedPullRequestReference | null {
  const text = input.trim()
  const hosted = GITHUB_PR.exec(text) ?? GITLAB_MR.exec(text)
  if (hosted) {
    return { repoName: hosted[1], number: Number(hosted[2]), url: text }
  }
  const short = SHORT_REF.exec(text)
  return short ? { repoName: short[1], number: Number(short[2]) } : null
}
