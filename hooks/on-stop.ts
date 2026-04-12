import { readStdin } from './lib/stdin.js'
import { HookRunner } from '../src/hooks/runner.js'

async function main() {
  const input = JSON.parse(await readStdin())
  const runner = new HookRunner()
  const output = await runner.handleStop(input)
  process.stdout.write(JSON.stringify(output))
}

main().catch((err) => {
  console.error('[openfeelz] Stop hook error:', err)
  process.exit(1)
})
