#!/usr/bin/env node
/**
 * Start the whole platform with one command.
 *
 *   node dev.mjs
 *
 * Three processes have to be running for anything to work: the API, the public
 * app and the control centre. Starting them by hand in three terminals is how
 * you end up with the API forgotten and every screen reporting a connection
 * problem — which is indistinguishable, from the browser, from a real one.
 *
 * No dependencies on purpose. Adding a process runner to the root of the
 * repository so that three commands can be typed as one is not a trade worth
 * making.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const SERVICES = [
  { name: 'api', dir: 'server', colour: '\x1b[35m', url: 'http://localhost:4000/health' },
  { name: 'app', dir: 'client', colour: '\x1b[36m', url: 'http://localhost:5173' },
  { name: 'admin', dir: 'admin', colour: '\x1b[33m', url: 'http://localhost:5174' },
]

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

for (const s of SERVICES) {
  if (!existsSync(path.join(HERE, s.dir, 'node_modules'))) {
    console.error(
      `\n  ${s.dir}/node_modules is missing. Run this first:\n\n` +
        `    cd ${s.dir} && npm install\n`
    )
    process.exit(1)
  }
}

console.log('\n\x1b[35m  MTONYO+\x1b[0m starting everything\n')
SERVICES.forEach((s) => console.log(`  ${s.colour}${s.name.padEnd(6)}${RESET}${DIM}${s.url}${RESET}`))
console.log(`\n${DIM}  Ctrl-C stops all three.${RESET}\n`)

const children = []

for (const s of SERVICES) {
  const child = spawn(npm, ['run', 'dev'], {
    cwd: path.join(HERE, s.dir),
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  children.push(child)

  // Prefix every line so three interleaved logs stay readable.
  const prefix = (chunk, stream) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) stream.write(`${s.colour}${s.name.padEnd(6)}${RESET}${line}\n`)
    }
  }
  child.stdout.on('data', (c) => prefix(c, process.stdout))
  child.stderr.on('data', (c) => prefix(c, process.stderr))

  child.on('exit', (code) => {
    // One dying takes the rest with it. A half-running platform looks like a
    // dozen unrelated bugs; a stopped one looks like what it is.
    if (code !== 0 && code !== null) {
      console.error(`\n  ${s.colour}${s.name}${RESET} exited with code ${code} — stopping the rest.\n`)
      stopAll(1)
    }
  })
}

let stopping = false
function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    try {
      c.kill()
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 400)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
