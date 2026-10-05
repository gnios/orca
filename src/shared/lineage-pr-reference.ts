export type ParsedPullRequestReference = {
  repoName: string
  number: number
  url?: string
  /** Known only for URL references; `repo#n` stays provider-neutral. */
  provider?: 'github' | 'gitlab'
}

const GITHUB_PR = /^https?:\/\/[^/]+\/[^/]+\/([^/]+)\/pull\/(\d+)\/?$/
const GITLAB_MR = /^https?:\/\/[^/]+\/(?:[^/]+\/)+([^/]+)\/-\/merge_requests\/(\d+)\/?$/
const SHORT_REF = /^([A-Za-z0-9._-]+)#(\d+)$/

export function parsePullRequestReference(input: string): ParsedPullRequestReference | null {
  const text = input.trim()
  const github = GITHUB_PR.exec(text)
  if (github) {
    return { repoName: github[1], number: Number(github[2]), url: text, provider: 'github' }
  }
  const gitlab = GITLAB_MR.exec(text)
  if (gitlab) {
    return { repoName: gitlab[1], number: Number(gitlab[2]), url: text, provider: 'gitlab' }
  }
  const short = SHORT_REF.exec(text)
  return short ? { repoName: short[1], number: Number(short[2]) } : null
}
