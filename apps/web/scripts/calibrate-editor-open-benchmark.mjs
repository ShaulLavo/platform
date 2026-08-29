import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createBenchmarkError } from './structured-errors.mjs'

const calibrationFile = resolve(import.meta.dirname, 'editor-open-benchmark-calibration.json')
const seeds = [60_061, 60_062, 60_063]
const runs = []

for (const seed of seeds) runs.push(await runCalibration(seed))

writeFileSync(calibrationFile, `${JSON.stringify({ schemaVersion: 1, runs }, null, 2)}\n`)
console.log(`EDITOR_OPEN_BENCHMARK_CALIBRATION ${calibrationFile}`)

async function runCalibration(seed) {
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      'scripts/editor-open-benchmark.mjs',
      '--calibrate',
      '--summary-only',
      '--browsers=chromium',
      `--seed=${seed}`,
    ],
    cwd: resolve(import.meta.dirname, '..'),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ])
  if (exitCode !== 0) {
    throw createBenchmarkError(`calibration seed ${seed} failed: ${stderr.trim()}`)
  }

  const prefix = 'EDITOR_OPEN_BENCHMARK_EVIDENCE '
  const evidenceLine = stdout.split('\n').find((line) => line.startsWith(prefix))
  if (!evidenceLine) {
    throw createBenchmarkError(`calibration seed ${seed} returned no evidence`)
  }

  const evidence = JSON.parse(evidenceLine.slice(prefix.length))
  console.log(`EDITOR_OPEN_BENCHMARK_CALIBRATION_RUN ${JSON.stringify(evidence)}`)
  return evidence
}
