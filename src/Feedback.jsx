import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './Feedback.css'

export const OPEN_FEEDBACK_EVENT = 'compound:open-feedback'

function Feedback({ user }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [thanks, setThanks] = useState(false)

  // Allow other parts of the app (e.g. left sidebar) to open the panel
  // without prop drilling, by dispatching a window event.
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(OPEN_FEEDBACK_EVENT, handler)
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handler)
  }, [])

  const submit = async () => {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    const { error } = await supabase.from('feedback').insert({ user_id: user.id, content })
    setSending(false)
    if (error) { alert(error.message); return }
    setText('')
    setThanks(true)
    setTimeout(() => { setThanks(false); setOpen(false) }, 1800)
  }

  const close = () => { if (!sending) { setOpen(false); setText(''); setThanks(false) } }

  return (
    <>
      {!open && (
        <button className="feedback-fab" onClick={() => setOpen(true)} title="Send us your feedback">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Send us your feedback</span>
        </button>
      )}

      {open && (
        <div className="feedback-panel">
          <div className="feedback-header">
            <h4>Send us feedback</h4>
            <button className="feedback-close" onClick={close} aria-label="Close">×</button>
          </div>
          {thanks ? (
            <div className="feedback-thanks">Thanks for your feedback!</div>
          ) : (
            <>
              <textarea
                placeholder="What's working, what's not, what's missing…"
                value={text}
                onChange={e => setText(e.target.value)}
                maxLength={1000}
              />
              <div className="feedback-actions">
                <button className="feedback-submit" onClick={submit} disabled={sending || !text.trim()}>
                  {sending ? 'Sending…' : 'Submit'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

export default Feedback
