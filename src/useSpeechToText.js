import { useCallback, useEffect, useRef, useState } from 'react'

// Wraps the browser SpeechRecognition API into a clean React hook.
//
// Features over the previous implementation:
//   - interim results stream into the input as the user speaks
//   - 10s of silence auto-stops recording
//   - clear listening state for a pulsing visual indicator
//   - graceful fallback (`supported === false`) so the UI can hide the mic
//     instead of showing a broken button
//   - microphone-permission and not-allowed errors surfaced to the caller
//
// Tested with Chrome desktop and mobile Safari — both expose
// webkitSpeechRecognition. Firefox does not, and we hide the button.

export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

const SILENCE_MS = 10_000

export function useSpeechToText({ onFinal, onInterim, lang = 'en-US' } = {}) {
  const SR = getSpeechRecognition()
  const supported = !!SR
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }

  const stop = useCallback(() => {
    clearSilenceTimer()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* already stopped */ }
    }
  }, [])

  const start = useCallback(() => {
    if (!supported || listening) return
    setError(null)
    let rec
    try {
      rec = new SR()
    } catch (err) {
      setError(`Speech recognition init failed: ${err.message}`)
      return
    }
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setListening(true)
      // Initial silence guard — if no audio in 10s, stop.
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => stop(), SILENCE_MS)
    }
    rec.onresult = (e) => {
      // Reset silence timer whenever we get any result.
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => stop(), SILENCE_MS)

      let finalChunk = ''
      let interimChunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interimChunk += r[0].transcript
      }
      if (finalChunk && onFinal) onFinal(finalChunk)
      if (interimChunk && onInterim) onInterim(interimChunk)
    }
    rec.onerror = (e) => {
      clearSilenceTimer()
      // 'no-speech' fires harmlessly on quiet pauses; not a real error.
      if (e.error === 'no-speech') return
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access blocked. Allow it in your browser settings.')
      } else if (e.error === 'audio-capture') {
        setError('No microphone detected.')
      } else {
        setError(`Voice input failed (${e.error}).`)
      }
      setListening(false)
    }
    rec.onend = () => {
      clearSilenceTimer()
      setListening(false)
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch (err) {
      setError(`Could not start: ${err.message}`)
      setListening(false)
    }
  }, [SR, supported, listening, lang, onFinal, onInterim, stop])

  // Stop on unmount so we don't leak the mic stream.
  useEffect(() => () => stop(), [stop])

  const toggle = useCallback(() => {
    if (listening) stop(); else start()
  }, [listening, start, stop])

  return { supported, listening, error, start, stop, toggle }
}
