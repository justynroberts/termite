import Anthropic from '@anthropic-ai/sdk'
import type { AIRequest, AIResponse } from '../shared/types'
import type { Store } from './store'

const SYSTEM_PROMPTS: Record<AIRequest['kind'], string> = {
  nl2cmd: `You are an expert sysadmin embedded in an SSH client. The user describes what they want in natural language; respond with the exact shell command to run.

Rules:
- Reply with ONLY the command on the first line. If a brief caveat is essential, put it on following lines after a blank line, max 2 sentences.
- Prefer safe, non-destructive variants. For destructive operations (rm, dd, mkfs, DROP, shutdown) include an echo of what will be affected or add an interactive flag.
- Target the OS indicated in context (default: Linux with bash).`,
  'explain-error': `You are an expert sysadmin embedded in an SSH client. The user shows you recent terminal output containing an error. Explain what went wrong in 2-4 short sentences, then give the most likely fix as a command if one exists. Be specific to the actual error shown, not generic.`,
  'explain-output': `You are an expert sysadmin embedded in an SSH client. Explain what the given terminal output means, concisely. Point out anything unusual, dangerous, or noteworthy.`,
  summarize: `You are an expert sysadmin embedded in an SSH client. Summarize what happened in this terminal session: key commands run, results, errors, and current state. Use short bullet points.`,
  chat: `You are an expert sysadmin and DevOps assistant embedded in an SSH client called Termite. Answer questions helpfully and concisely. When suggesting commands, put each in a fenced code block.`,
  'draft-runbook': `You are an expert sysadmin embedded in an SSH client. The user describes an operational task to run across one or more servers. Design it as an ordered list of runbook steps.

Reply with ONLY a JSON array, no prose, no code fences. Each element:
{"name": "short step name", "command": "shell command(s), multi-line allowed", "parallel": true|false, "continueOnError": true|false}

Rules:
- Split logically: pre-checks first (parallel), the change itself, verification last.
- Prefer non-interactive flags (-y, --no-pager, DEBIAN_FRONTEND=noninteractive).
- Fail fast: continueOnError=false unless the step is purely informational.
- parallel=true only when hosts don't depend on each other for that step (e.g. checks); use false for rolling changes.
- Target Linux/bash unless the user says otherwise.`
}

export async function runAI(store: Store, req: AIRequest): Promise<AIResponse> {
  const apiKey = store.getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'No Anthropic API key configured. Add one in Settings → AI.' }
  }

  const settings = store.getSettings()
  const client = new Anthropic({ apiKey })

  let userContent = req.prompt
  if (req.terminalContext) {
    userContent = `<terminal_output>\n${req.terminalContext.slice(-12000)}\n</terminal_output>\n\n${req.prompt}`
  }
  if (req.osHint) {
    userContent = `(Remote OS: ${req.osHint})\n${userContent}`
  }

  try {
    const message = await client.messages.create({
      model: settings.aiModel || 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: SYSTEM_PROMPTS[req.kind],
      messages: [{ role: 'user', content: userContent }]
    })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    if (req.kind === 'nl2cmd') {
      const command = text.split('\n')[0].replace(/^```\w*\s*/, '').replace(/```$/, '').trim()
      return { ok: true, text, command }
    }
    return { ok: true, text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function testAI(store: Store): Promise<AIResponse> {
  const apiKey = store.getApiKey()
  if (!apiKey) return { ok: false, error: 'No Anthropic API key is saved.' }
  try {
    const client = new Anthropic({ apiKey })
    await client.messages.create({
      model: store.getSettings().aiModel || 'claude-sonnet-4-5-20250929',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply OK' }]
    })
    return { ok: true, text: 'Connected' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
