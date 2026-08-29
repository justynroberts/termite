import { useEffect, useRef, useState, type JSX } from 'react'
import type { AIRequest } from '../../../shared/types'
import { useApp } from '../state'
import { IconCopy, IconFile, IconPlay, IconRefresh, IconSearch, IconSend, IconTermite, IconX } from '../icons'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  command?: string
  error?: boolean
}

export default function AIDrawer(): JSX.Element {
  const { setAiOpen, activeSessionId, sendToActiveTerminal, settings, toast, setView } = useApp()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const hasTerminal = !!activeSessionId

  const ask = async (kind: AIRequest['kind'], prompt: string, showAs?: string): Promise<void> => {
    if (busy) return
    if (!settings.anthropicApiKey) {
      toast('Add your Anthropic API key in Settings first', 'warn')
      setView('settings')
      return
    }
    setMessages((m) => [...m, { role: 'user', text: showAs ?? prompt }])
    setBusy(true)
    try {
      const res = await window.termite.ai.run({ kind, prompt }, activeSessionId)
      if (res.ok && res.text) {
        setMessages((m) => [...m, { role: 'assistant', text: res.text!, command: res.command }])
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: res.error ?? 'Unknown error', error: true }])
      }
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: String(err), error: true }])
    } finally {
      setBusy(false)
    }
  }

  const submit = (): void => {
    const text = input.trim()
    if (!text) return
    setInput('')
    // Heuristic: if it reads like a request for a command, use nl2cmd; otherwise chat
    const wantsCommand = /^(how do i|show me|list|find|kill|restart|install|create|delete|check|get|make|set up|setup|tail|grep|count|compress|extract|copy|move|download|upload|mount|start|stop|enable|disable|update|upgrade)\b/i.test(text)
    void ask(wantsCommand ? 'nl2cmd' : 'chat', text)
  }

  const runCommand = (command: string): void => {
    if (!hasTerminal) {
      toast('Open a terminal to run commands', 'warn')
      return
    }
    sendToActiveTerminal(command + '\n')
  }

  const insertCommand = (command: string): void => {
    if (!hasTerminal) {
      toast('Open a terminal first', 'warn')
      return
    }
    sendToActiveTerminal(command) // no newline — user reviews & presses Enter
  }

  return (
    <div className="ai-drawer">
      <div className="ai-header">
        <span className="title">
          <IconTermite size={18} /> Termite AI
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
            {renderText(m.text)}
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
        </div>
        <div className="ai-input-box">
          <textarea
            ref={inputRef}
            value={input}
            placeholder={hasTerminal ? 'Describe what you want to do…' : 'Ask me anything…'}
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

/** Render text with ```fenced blocks``` and `inline code`. */
function renderText(text: string): JSX.Element {
  const parts = text.split(/```(?:\w+)?\n?([\s\S]*?)```/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i}>{part.trim()}</pre>
        ) : (
          <span key={i}>
            {part.split(/`([^`]+)`/g).map((seg, j) =>
              j % 2 === 1 ? (
                <code className="inline" key={j}>
                  {seg}
                </code>
              ) : (
                seg
              )
            )}
          </span>
        )
      )}
    </>
  )
}
