import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { extractOnboarding } from './aiChat'
import { useSpeechToText } from './useSpeechToText'
import './Onboarding.css'

const MAX_USER_TURNS = 4 // hard cap so we don't loop forever, but typical flow is 2-3

function defaultGreeting(isCompany) {
  if (isCompany) {
    return `Welcome to Compound. I'll set up your company profile from this conversation. Tell me about your company — name, what you do, your sector, what you're looking for on Compound, and anything else you'd like on your profile. You can also drop a logo here. Just write naturally and I'll take care of the rest.`
  }
  return `Welcome to Compound. I'll set up your profile from this conversation. Tell me about yourself — your name, what you do, your industry, what you're looking for on Compound, and anything else you'd like on your profile. You can also drop a profile photo here. Just write naturally and I'll take care of the rest.`
}

function Onboarding({ user, onComplete }) {
  const isCompany = user.accountType === 'company'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [collected, setCollected] = useState({})
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [userTurns, setUserTurns] = useState(0)
  const [savedUpdate, setSavedUpdate] = useState(null)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [interim, setInterim] = useState('')
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const { supported: speechSupported, listening, error: speechError, toggle: toggleMic } = useSpeechToText({
    onFinal: (text) => {
      setInput(prev => (prev ? prev.replace(/\s+$/, '') + ' ' : '') + text.trim())
      setInterim('')
    },
    onInterim: (text) => setInterim(text),
  })

  // Mount: post the single comprehensive greeting
  useEffect(() => {
    setMessages([{ role: 'assistant', content: defaultGreeting(isCompany) }])
  }, [isCompany])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const submitMessage = async () => {
    if (busy || done) return
    const text = input.trim()
    if (!text) return
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput('')
    setBusy(true)

    const newTurnCount = userTurns + 1
    const allowFollowUp = newTurnCount < MAX_USER_TURNS

    try {
      const result = await extractOnboarding({
        userMessage: text,
        isCompany,
        previouslyCollected: collected,
        allowFollowUp,
        history: [...messages, { role: 'user', content: text }],
      })

      // Merge non-empty fields into collected
      const e = result.extracted || {}
      const next = { ...collected }
      for (const [k, v] of Object.entries(e)) {
        if (v !== null && v !== undefined && String(v).trim() !== '') next[k] = v
      }
      setCollected(next)

      // Show ack
      setMessages(m => [...m, { role: 'assistant', content: result.reply || 'Got it.' }])
      setUserTurns(newTurnCount)

      const stillMissing = (result.missing_critical || []).filter(Boolean)
      const criticalSatisfied = stillMissing.length === 0

      if (criticalSatisfied) {
        // Critical fields collected — enter review mode. The AI's reply is a
        // recap + "anything else?" offer. Wait for user confirmation or more
        // input. If we've burned our turn budget, finalize anyway as safety.
        if (newTurnCount >= MAX_USER_TURNS) {
          await finalize(next)
        } else {
          setAwaitingConfirm(true)
        }
      } else {
        setAwaitingConfirm(false)
      }
    } catch (err) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: `Hit a snag with the AI (${err.message}). Saving what I have so far.`,
      }])
      // On API failure, still try to save with whatever we have
      await finalize(collected)
    } finally {
      setBusy(false)
    }
  }

  const confirmAndSave = async () => {
    if (busy || done) return
    setBusy(true)
    try {
      await finalize(collected)
    } finally {
      setBusy(false)
    }
  }

  const onUploadFile = async (file) => {
    if (!file || busy || done) return
    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || undefined,
      })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(data.publicUrl)
      setAvatarPreview(URL.createObjectURL(file))
      setMessages(m => [...m, { role: 'assistant', content: 'Got the photo — looking good.' }])
    } catch (e) {
      alert(`Upload failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const finalize = async (data) => {
    const update = {
      display_name: (data.display_name && String(data.display_name).trim()) || user.name,
      headline: (data.headline && String(data.headline).trim()) || null,
      sector: data.sector || null,
      location: (data.location && String(data.location).trim()) || null,
      avatar_url: avatarUrl,
      feed_preferences: {
        looking_for: data.looking_for || null,
        sector_other: (data.sector === 'other' && data.sector_other) ? data.sector_other : null,
      },
      onboarded: true,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
    if (error) {
      setMessages(m => [...m, { role: 'assistant', content: `Couldn't save the profile: ${error.message}` }])
      return
    }
    setSavedUpdate(update)
    setMessages(m => {
      // If Claude already gave a closing-style reply, don't double up
      const last = m[m.length - 1]
      const alreadyClosed = last?.role === 'assistant' && /(all set|ready|good to go|set up)/i.test(last.content || '')
      if (alreadyClosed) return m
      return [...m, {
        role: 'assistant',
        content: `You're all set${update.display_name ? `, ${update.display_name}` : ''}. Your feed is personalized and ready.`,
      }]
    })
    setDone(true)
    // Don't auto-advance — wait for the user to click "Go to Compound".
  }

  const onInputKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitMessage()
    }
  }

  return (
    <div className="onboarding-screen">
      <header className="onboarding-header">
        <div className="onboarding-logo">
          <span className="logo-c">C</span>ompound
          <div className="logo-bar" />
        </div>
      </header>

      <main className="onboarding-main">
        <div className="onboarding-card">
          <div className="onboarding-history">
            {messages.map((m, i) => (
              <div key={i} className={`onboarding-msg ${m.role}`}>
                <div className="onboarding-bubble">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="onboarding-msg assistant">
                <div className="onboarding-bubble thinking">…</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!done && (
            <>
              {/* Avatar upload area — always available during the conversation */}
              <div className="onboarding-upload">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => onUploadFile(e.target.files?.[0])}
                />
                <button
                  className="onboarding-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" />
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>{isCompany ? 'Add a logo (optional)' : 'Add a profile photo (optional)'}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="onboarding-input-row">
                <input
                  type="text"
                  placeholder={userTurns === 0 ? 'Tell me about yourself…' : 'Type your reply…'}
                  value={interim ? (input ? `${input} ${interim}` : interim) : input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onInputKey}
                  disabled={busy}
                  autoFocus
                />
                {speechSupported && (
                  <button
                    className={`onboarding-mic ${listening ? 'listening' : ''}`}
                    onClick={toggleMic}
                    title={listening ? 'Stop listening' : 'Voice input'}
                    aria-label="Voice input"
                    disabled={busy}
                  >
                    {listening && <span className="mic-pulse" aria-hidden="true" />}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                )}
                <button
                  className="onboarding-send"
                  onClick={submitMessage}
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>

              {speechError && (
                <div className="onboarding-speech-error">{speechError}</div>
              )}

              {awaitingConfirm && (
                <div className="onboarding-confirm-row">
                  <button
                    className="onboarding-confirm-btn"
                    onClick={confirmAndSave}
                    disabled={busy}
                  >
                    Looks good — save my profile
                  </button>
                </div>
              )}
            </>
          )}

          {done && (
            <div className="onboarding-cta">
              <button className="onboarding-go-btn" onClick={() => onComplete?.(savedUpdate)}>
                Go to Compound
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Onboarding
