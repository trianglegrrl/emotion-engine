import { readStdin } from './lib/stdin.js'
import { HookRunner } from '../src/hooks/runner.js'

async function main() {
  const input = JSON.parse(await readStdin())
  const runner = new HookRunner()
  const output = await runner.handleUserPrompt(input)
  process.stdout.write(JSON.stringify(output))
}

main().catch((err) => {
  console.error('[openfeelz] UserPromptSubmit hook error:', err)
  process.exit(1)
})
