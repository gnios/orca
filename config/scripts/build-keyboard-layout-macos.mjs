#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const sourcePath = path.join(repoRoot, 'native', 'keyboard-layout-macos', 'main.swift')
const defaultOutputPath = path.join(
  repoRoot,
  'native',
  'keyboard-layout-macos',
  '.build',
  'release',
  'orca-keyboard-layout'
)

if (process.platform !== 'darwin') {
  process.exit(0)
}

const args = process.argv.slice(2)
const outputPath = readArg('--output') ?? defaultOutputPath
const singleArch = args.includes('--single-arch')
const workDir = mkdtempSync(path.join(tmpdir(), 'orca-keyboard-layout-'))

try {
  const candidateTriples = singleArch
    ? [process.arch === 'arm64' ? 'arm64-apple-macosx' : 'x86_64-apple-macosx']
    : ['arm64-apple-macosx', 'x86_64-apple-macosx']
  const builtBinaries = []
  for (const triple of candidateTriples) {
    const output = path.join(workDir, `orca-keyboard-layout-${triple}`)
    try {
      execFileSync(
        'swiftc',
        [
          '-module-cache-path',
          path.join(workDir, 'module-cache'),
          '-O',
          sourcePath,
          '-target',
          triple.replace('-apple-macosx', '-apple-macosx11.0'),
          '-o',
          output
        ],
        { stdio: 'inherit' }
      )
      builtBinaries.push(output)
    } catch (err) {
      // why: host CLT may lack non-host swift libraries; keep host arch for local builds
      if (candidateTriples.length > 1 && !triple.startsWith(process.arch)) {
        console.warn(`[build-keyboard-layout] skipping non-host arch ${triple}: ${err.message}`)
        continue
      }
      throw err
    }
  }
  mkdirSync(path.dirname(outputPath), { recursive: true })
  rmSync(outputPath, { force: true })
  if (builtBinaries.length === 1) {
    copyFileSync(builtBinaries[0], outputPath)
  } else {
    execFileSync('lipo', ['-create', ...builtBinaries, '-output', outputPath])
  }
  chmodSync(outputPath, 0o755)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}

function readArg(name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
