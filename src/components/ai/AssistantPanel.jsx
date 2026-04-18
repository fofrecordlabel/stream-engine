import { useEffect, useMemo, useState } from 'react'
import { T } from '../../tokens.js'
import { runStreamEngineAI } from '../../lib/aiClient.js'
import { useToast } from '../../context/ToastContext.jsx'

const USE_CASES = [
  { id: 'rewrite_pitch', label: 'Rewrite Artist Pitch', applyable: true },
  { id: 'improve_copy', label: 'Improve Submission Copy', applyable: true },
  { id: 'score_playlist_fit', label: 'Score Playlist Fit', applyable: false },
  { id: 'suggest_outreach', label: 'Suggest Outreach Message', applyable: false },
  { id: 'summarize_feedback', label: 'Summarize Curator Feedback', applyable: false },
  { id: 'generate_campaign_ideas', label: 'Generate Campaign Ideas', applyable: false },
]

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin .7s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,.3)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#000" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function AssistantPanel({
  context = {},
  initialText = '',
  allowedUseCases = null,
  onApply = null,
  applyLabel = 'Apply to Pitch',
  compact = false,
  cardTitle = 'AI Assistant',
  cardSubtitle = 'Context-aware improvements'
}) {
  const toast = useToast()
  const [useCase, setUseCase] = useState(allowedUseCases?.[0] || 'rewrite_pitch')
  const [input, setInput] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [content, setContent] = useState('')

  const useCaseOptions = useMemo(() => {
    const ids = allowedUseCases
    const list = ids ? USE_CASES.filter(x => ids.includes(x.id)) : USE_CASES
    return list.length ? list : USE_CASES
  }, [allowedUseCases])

  const currentMeta = useCaseOptions.find(u => u.id === useCase) || useCaseOptions[0]
  const canApply = !!onApply && currentMeta?.applyable

  const promptPreview = useMemo(() => {
    const ctx = context ? JSON.stringify(context, null, 2) : '{}'
    const inputBlock = input?.trim() ? input.trim() : '(empty)'
    return [
      `Use case: ${useCase}`,
      `Input:`,
      inputBlock,
      ``,
      `Context:`,
      ctx,
    ].join('\n')
  }, [context, input, useCase])

  const doGenerate = async () => {
    setError('')
    setLoading(true)
    setContent('')
    try {
      const r = await runStreamEngineAI({ useCase, input, context })
      setContent(r.content || '')
      if (r.meta?.demo) {
        toast.info('Running in demo AI mode. Set `OPENAI_API_KEY` for real responses.', 'AI Demo', 4500)
      }
    } catch (e) {
      setError(e?.message || 'AI request failed')
      toast.error(e?.message || 'AI request failed', 'AI Error', 5500)
    } finally {
      setLoading(false)
    }
  }

  // Keep the generator input aligned with whatever the user has in the app.
  useEffect(() => {
    if (loading) return
    setInput(initialText)
    setContent('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText])

  const containerStyle = {
    background: 'linear-gradient(145deg,#101013,#0d0d10)',
    border: `1px solid ${T.b0}`,
    borderRadius: 16,
    padding: compact ? '16px 16px' : '20px 20px',
    boxShadow: '0 20px 80px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)',
    overflow: 'hidden',
    position: 'relative',
  }

  return (
    <div style={containerStyle}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -60, left: -80, width: 220, height: 220, background: `radial-gradient(circle,${T.gn}18,transparent 65%)` }} />
        <div style={{ position: 'absolute', bottom: -80, right: -80, width: 240, height: 240, background: `radial-gradient(circle,${T.gold}14,transparent 65%)` }} />
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: T.g300, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              {cardTitle}
            </div>
            <div style={{ fontSize: compact ? 12.5 : 13.5, color: T.g200, lineHeight: 1.5, maxWidth: 360 }}>
              {cardSubtitle}
            </div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.gn, padding: '6px 10px', borderRadius: 999, background: T.gnGl, border: `1px solid ${T.gnB}`, whiteSpace: 'nowrap' }}>
            Secure AI
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ gridColumn: compact ? 'auto' : 'span 2' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 7 }}>
              Tool
            </label>
            <select
              value={useCase}
              onChange={(e) => {
                const v = e.target.value
                setUseCase(v)
                setContent('')
                setError('')
              }}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,.04)',
                border: `1px solid ${T.b1}`,
                borderRadius: 12,
                padding: '10px 12px',
                color: T.w,
                fontSize: 13.5,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {useCaseOptions.map(u => (
                <option key={u.id} value={u.id} style={{ background: T.bg2 }}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 7 }}>
            Input
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={compact ? 3 : 4}
            placeholder="Paste your pitch, feedback, or context…"
            style={{
              width: '100%',
              background: 'rgba(255,255,255,.04)',
              border: `1px solid ${T.b1}`,
              borderRadius: 12,
              padding: '12px 14px',
              color: T.w,
              fontSize: 13.5,
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.55,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: T.g400, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              Prompt preview
            </div>
            <div style={{ fontSize: 11, color: T.g300, fontWeight: 700 }}>
              Local-only preview
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,.02)',
              border: `1px solid ${T.b0}`,
              borderRadius: 12,
              padding: 12,
              maxHeight: compact ? 130 : 160,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: 12.5,
              color: T.g100,
              lineHeight: 1.55,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
          >
            {promptPreview}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', marginTop: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            className="bp"
            onClick={doGenerate}
            disabled={loading}
            style={{
              padding: compact ? '10px 18px' : '11px 22px',
              fontSize: 13.5,
              minWidth: 160,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <Spinner /> Generating…
              </span>
            ) : (
              'Generate'
            )}
          </button>

          <div style={{ fontSize: 12, color: T.g300, fontWeight: 600, lineHeight: 1.4 }}>
            No keys in frontend.
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.22)', borderRadius: 12, padding: '10px 12px', color: T.red, fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>
            ⚠ {error}
          </div>
        )}

        {content && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: T.g400, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Result
            </div>
            <div style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${T.b0}`, borderRadius: 12, padding: 14, whiteSpace: 'pre-wrap', fontSize: 13.5, color: T.g100, lineHeight: 1.6, marginBottom: 10 }}>
              {content}
            </div>
            {canApply && (
              <button
                className="bp"
                onClick={() => onApply(content)}
                style={{ width: '100%', padding: '12px 18px', fontSize: 14 }}
              >
                {applyLabel} <span className="arr">→</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

