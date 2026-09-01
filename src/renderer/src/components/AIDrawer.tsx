import { isValidElement, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AIRequest } from '../../../shared/types'
import { useApp } from '../state'
import { IconCopy, IconFile, IconPlay, IconRefresh, IconSearch, IconSend, IconX } from '../icons'
import TermiteLogo from './TermiteLogo'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  command?: string
  error?: boolean
}

const hostMemories = new Map<string, Msg[]>()

function asRunnableScript(command: string): string {
  if (!command.includes('\n')) return command
  return `TERMITE_SCRIPT_PATH=$(mktemp /tmp/termite-ai.XXXXXX)\ncat > "$TERMITE_SCRIPT_PATH" <<'TERMITE_SCRIPT_EOF'\n${command}\nTERMITE_SCRIPT_EOF\nchmod 700 "$TERMITE_SCRIPT_PATH"\n"$TERMITE_SCRIPT_PATH"\nTERMITE_SCRIPT_STATUS=$?\nrm -f "$TERMITE_SCRIPT_PATH"\nunset TERMITE_SCRIPT_PATH\n(exit $TERMITE_SCRIPT_STATUS)`
}

function isPotentiallyDestructive(command: string): boolean {
  return /(?:^|[;&|]\s*)(?:sudo\s+)?(?:rm\b|rmdir\b|shred\b|truncate\b|dd\b|mkfs\b|wipefs\b|fdisk\b|parted\b|shutdown\b|reboot\b|poweroff\b|halt\b|userdel\b|groupdel\b)|\b(?:docker|podman)\s+(?:system|image|container|volume|network)?\s*prune\b|\bkubectl\s+delete\b|\bterraform\s+destroy\b|\bgit\s+(?:reset\s+--hard|clean\s+-[^\n]*f)\b|\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b|\bDELETE\s+FROM\b/i.test(command)
}

export default function AIDrawer(): JSX.Element {
  const { setAiOpen, activeSessionId, sendToActiveTerminal, settings, toast, setView, tabs, activeTabId, aiSeed, clearAiSeed, aiSubject } = useApp()
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const memoryKey = activeTab?.kind === 'terminal' ? `host:${activeTab.hostId}` : 'general'
  const memoryKeyRef = useRef(memoryKey)
  const [messages, setMessages] = useState<Msg[]>(() => hostMemories.get(memoryKey) ?? [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    memoryKeyRef.current = memoryKey
    setMessages(hostMemories.get(memoryKey) ?? [])
  }, [memoryKey])

  const appendMemory = (key: string, message: Msg): void => {
    const next = [...(hostMemories.get(key) ?? []), message].slice(-40)
    hostMemories.set(key, next)
    if (memoryKeyRef.current === key) setMessages(next)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const hasTerminal = !!activeSessionId
  // A subject published by the current screen wins over the focused terminal:
  // if you are looking at a run or a transcript, that is what you mean.
  const subject = aiSubject

  // A question queued from elsewhere — the runbook run view — runs once as soon
  // as the drawer is up, then clears so reopening does not re-ask it.
  useEffect(() => {
    if (!aiSeed || busy) return
    const seed = aiSeed
    clearAiSeed()
    void ask(seed.kind, seed.prompt, seed.prompt, { context: seed.context, label: seed.label })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSeed])

  const ask = async (
    kind: AIRequest['kind'],
    prompt: string,
    showAs?: string,
    // Supplied when the question is about something that is not the focused
    // terminal — a runbook run, say. The main process only substitutes session
    // scrollback when no context came with the request.
    override?: { context: string; label: string }
  ): Promise<void> => {
    if (busy) return
    if (!settings.anthropicApiKey) {
      toast('Add your Anthropic API key in Settings first', 'warn')
      setView('settings')
      return
    }
    const key = memoryKey
    const prior = hostMemories.get(key) ?? []
    appendMemory(key, { role: 'user', text: showAs ?? prompt })
    setBusy(true)
    try {
      const history = prior
        .filter((message) => !message.error)
        .map((message) => ({ role: message.role, content: message.text }))
      const res = await window.termite.ai.run(
        {
          kind,
          prompt,
          history,
          hostLabel: override?.label ?? activeTab?.title,
          ...(override ? { terminalContext: override.context } : {})
        },
        override ? undefined : activeSessionId
      )
      if (res.ok && res.text) {
        appendMemory(key, { role: 'assistant', text: res.text, command: res.command })
      } else {
        appendMemory(key, { role: 'assistant', text: res.error ?? 'Unknown error', error: true })
      }
    } catch (err) {
      appendMemory(key, { role: 'assistant', text: String(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  const submit = (): void => {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (subject) {
      void ask(subject.kind, text, text, { context: subject.context(), label: subject.label })
      return
    }
    // Heuristic: if it reads like a request for a command, use nl2cmd; otherwise chat
    const wantsCommand = /^(how do i|show me|list|find|kill|restart|install|create|delete|check|get|make|set up|setup|tail|grep|count|compress|extract|copy|move|download|upload|mount|start|stop|enable|disable|update|upgrade)\b/i.test(text)
    void ask(wantsCommand ? 'nl2cmd' : 'chat', text)
  }

  const runCommand = (command: string): void => {
    if (!hasTerminal) {
      toast('Open a terminal to run commands', 'warn')
      return
    }
    const risky = isPotentiallyDestructive(command)
    if (risky && !confirm(`Potentially destructive command. Run it anyway?\n\n${command}`)) {
      void window.termite.activity.record({ action: 'ai.run.cancelled', target: activeTab?.title, detail: command, outcome: 'info' })
      return
    }
    void window.termite.activity.record({ action: command.includes('\n') ? 'ai.script.run' : 'ai.command.run', target: activeTab?.title, detail: command, outcome: risky ? 'info' : 'ok' })
    sendToActiveTerminal(asRunnableScript(command) + '\n')
  }

  const insertCommand = (command: string): void => {
    if (!hasTerminal) {
      toast('Open a terminal first', 'warn')
      return
    }
    void window.termite.activity.record({ action: command.includes('\n') ? 'ai.script.insert' : 'ai.command.insert', target: activeTab?.title, detail: command, outcome: 'ok' })
    sendToActiveTerminal(command) // no newline — user reviews & presses Enter
  }

  return (
    <div className="ai-drawer">
      <div className="ai-header">
        <span className="title">
          <TermiteLogo size={20} /> Termite AI
          <span className="ai-memory" title="Conversation memory is isolated to this host">
            {activeTab?.kind === 'terminal' ? activeTab.title : 'General'}
          </span>
        </span>
        <button className="icon-btn" onClick={() => setAiOpen(false)}>
          <IconX size={15} />
        </button>
      </div>
      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: 12.5, lineHeight: 1.6 }}>
            Ask anything about your servers, or describe what you want to do in plain English —
            I&rsquo;ll write the command. I can see the recent output of your active terminal, so
            &ldquo;why did that fail?&rdquo; just works.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`} style={m.error ? { borderColor: 'var(--danger)' } : undefined}>
            {renderText(m.text, insertCommand, runCommand, toast)}
            {m.command && (
              <div className="cmd-actions">
                <button className="btn sm primary" onClick={() => runCommand(m.command!)} title="Run in active terminal">
                  <IconPlay size={12} /> Run
                </button>
                <button className="btn sm" onClick={() => insertCommand(m.command!)} title="Type into terminal without executing">
                  Insert
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    window.termite.clipboard.writeText(m.command!)
                    toast('Copied')
                  }}
                >
                  <IconCopy size={12} /> Copy
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="ai-thinking">
            <span /><span /><span />
          </div>
        )}
      </div>
      <div className="ai-input-row">
        <div className="ai-quick-actions">
          {subject ? (
            <>
              <span className="chip chip-subject" title="What these actions will look at">
                {subject.label}
              </span>
              {subject.actions.map((action) => (
                <button
                  key={action.label}
                  className="chip"
                  disabled={busy}
                  onClick={() =>
                    ask(subject.kind, action.prompt, action.label, {
                      context: subject.context(),
                      label: subject.label
                    })
                  }
                >
                  {action.label}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                className="chip"
                onClick={() => ask('explain-error', 'Explain the most recent error in my terminal and how to fix it.', 'Explain last error')}
                disabled={!hasTerminal || busy}
              >
                <IconRefresh size={12} /> Explain last error
              </button>
              <button
                className="chip"
                onClick={() => ask('explain-output', 'Explain what the recent terminal output means.', 'Explain output')}
                disabled={!hasTerminal || busy}
              >
                <IconSearch size={12} /> Explain output
              </button>
              <button
                className="chip"
                onClick={() => ask('summarize', 'Summarize this terminal session.', 'Summarize session')}
                disabled={!hasTerminal || busy}
              >
                <IconFile size={12} /> Summarize session
              </button>
            </>
          )}
        </div>
        <div className="ai-input-box">
          <textarea
            ref={inputRef}
            value={input}
            placeholder={
              subject
                ? `Ask about this ${subject.label.split(' · ')[0]}…`
                : hasTerminal
                  ? 'Describe what you want to do…'
                  : 'Ask me anything…'
            }
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button className="btn primary" onClick={submit} disabled={busy || !input.trim()} style={{ alignSelf: 'flex-end' }}>
            <IconSend size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

const SHELL_COMMAND = /^\s*(?:sudo\s+)?(?:whois|curl|wget|ssh|scp|sftp|rsync|grep|find|sed|awk|tail|head|cat|less|ls|cd|pwd|ps|top|htop|kill|pkill|chmod|chown|tar|zip|unzip|apt|apt-get|dnf|yum|brew|docker|podman|kubectl|systemctl|journalctl|service|ufw|iptables|dig|nslookup|ping|traceroute|ip|netstat|ss|openssl|git|npm|pnpm|yarn|python|python3|node)\b/i

/** Promote obvious bare shell lines to fenced blocks so AI prose remains actionable. */
function commandAwareMarkdown(text: string): string {
  let fenced = false
  return text
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        fenced = !fenced
        return line
      }
      if (!fenced && line.length < 500 && SHELL_COMMAND.test(line)) return `\`\`\`shell\n${line.trim()}\n\`\`\``
      return line
    })
    .join('\n')
}

interface CommandBlockProps {
  command: string
  onInsert: (command: string) => void
  onRun: (command: string) => void
  onCopy: (command: string) => void
}

function CommandBlock({ command, onInsert, onRun, onCopy }: CommandBlockProps): JSX.Element {
  const isScript = command.includes('\n')
  return (
    <div className="ai-command-block">
      <button className="ai-command-code" title="Insert into active terminal" onClick={() => onInsert(command)}>
        <code>{command}</code>
      </button>
      <div className="cmd-actions">
        <button className="btn sm" onClick={() => onCopy(command)}><IconCopy size={12} /> Copy</button>
        <button className="btn sm" onClick={() => onInsert(command)}>Insert{isScript ? ' script' : ''}</button>
        <button className="btn sm primary" onClick={() => onRun(command)}><IconPlay size={12} /> Run{isScript ? ' script' : ''}</button>
      </div>
    </div>
  )
}

function renderText(
  text: string,
  onInsert: (command: string) => void,
  onRun: (command: string) => void,
  toast: (message: string) => void
): JSX.Element {
  const copy = (command: string): void => {
    window.termite.clipboard.writeText(command)
    toast('Command copied')
  }
  return (
    <div className="ai-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} onClick={(event) => {
              event.preventDefault()
              if (href) window.termite.openExternal(href)
            }}>{children}</a>
          ),
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children
            if (isValidElement<{ children?: ReactNode; className?: string }>(child)) {
              const command = String(child.props.children ?? '').replace(/\n$/, '')
              const shellLanguage = /language-(?:bash|sh|shell|console)/i.test(child.props.className ?? '')
              const looksRunnable = shellLanguage || SHELL_COMMAND.test(command) || /^#!.*\b(?:ba|z|k)?sh\b/m.test(command)
              if (looksRunnable) return <CommandBlock command={command} onInsert={onInsert} onRun={onRun} onCopy={copy} />
            }
            return <pre>{children}</pre>
          }
        }}
      >
        {commandAwareMarkdown(text)}
      </Markdown>
    </div>
  )
}
