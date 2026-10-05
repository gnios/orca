import { DEFAULT_KEY_REGEX } from './lineage-discovery-types'

const TICKET_KEY = /[A-Za-z][A-Za-z0-9]{1,9}-\d+/g

export function extractTicketKeys(text: string): string[] {
  let target = text
  if (target.includes('::')) {
    target = target.split('::').slice(1).join('::')
  }
  const keys = new Set<string>()
  for (const match of target.matchAll(TICKET_KEY)) {
    keys.add(match[0].toUpperCase())
  }
  return [...keys]
}

export function matchesTicketKeys(name: string, keys: string[]): boolean {
  const haystack = name.toLowerCase()
  return keys.some((key) => {
    const needle = key.toLowerCase()
    let from = 0
    for (;;) {
      const at = haystack.indexOf(needle, from)
      if (at === -1) {
        return false
      }
      const before = haystack[at - 1]
      const after = haystack[at + needle.length]
      // invariant: a key only counts as a whole token, so LEVGP-48 never matches LEVGP-483
      if (!(before && /[a-z0-9]/.test(before)) && !(after && /[0-9]/.test(after))) {
        return true
      }
      from = at + 1
    }
  })
}

export function extractKeysWithPattern(
  text: string,
  keyRegex: string
): { keys: string[]; error?: string } {
  let pattern: RegExp
  let error: string | undefined
  try {
    pattern = new RegExp(keyRegex, 'g')
  } catch {
    pattern = new RegExp(DEFAULT_KEY_REGEX, 'g')
    error = `Invalid key pattern, using the default: ${keyRegex}`
  }
  const target = text.includes('::') ? text.split('::').slice(1).join('::') : text
  const keys = new Set<string>()
  for (const match of target.matchAll(pattern)) {
    keys.add(match[0].toUpperCase())
  }
  return error ? { keys: [...keys], error } : { keys: [...keys] }
}
