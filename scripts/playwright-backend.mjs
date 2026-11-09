#!/usr/bin/env node
/**
 * Starts the backend for the Playwright golden path against a dedicated,
 * freshly created SQLite database.
 *
 * The database lives outside the repository so a run never touches the dev
 * database. Removing the file (and its WAL/SHM companions) before startup
 * guarantees that migrations recreate an empty schema on every run.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const databaseDir = join(tmpdir(), 'call-calendar-playwright')
const databasePath = join(databaseDir, 'e2e.db')

mkdirSync(databaseDir, { recursive: true })
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${databasePath}${suffix}`, { force: true })
}

const child = spawn('pnpm', ['--filter', 'backend', 'start'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `file:${databasePath}`,
    PORT: process.env.PORT ?? '3000',
  },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

child.on('error', (error) => {
  console.error('Failed to start the backend for Playwright:', error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
