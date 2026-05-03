import { useState } from 'react'
import { supabase } from './supabaseClient'
import { SECTORS } from './format'
import './Auth.css'

// Personal / free email-provider domains. Mirrored in the
// extract_company_domain SQL function in 0004_company_domain.sql — keep
// them in sync.
const PERSONAL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'proton.me',
  'live.com', 'msn.com', 'me.com', 'mac.com',
  'gmx.com', 'gmx.net', 'mail.com',
  'yandex.com', 'yandex.ru', 'fastmail.com', 'fastmail.fm',
  'zoho.com', 'tutanota.com', 'hey.com',
]

function Auth() {
  const [mode, setMode] = useState('signup')
  const [accountType, setAccountType] = useState('company')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sector, setSector] = useState('')
  const [sectorOther, setSectorOther] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(null)

  const emailDomain = (email.split('@')[1] || '').toLowerCase()
  const showPersonalEmailNotice = accountType === 'company' && !!emailDomain && PERSONAL_DOMAINS.includes(emailDomain)

  const handleSignup = async () => {
    setInfo(null)
    if (!name || !email || !password) { alert('Please fill in all fields.'); return }
    if (password.length < 8) { alert('Password must be at least 8 characters.'); return }

    setBusy(true)
    const sectorOtherTrim = sector === 'other' ? sectorOther.trim() : ''
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, sector, sector_other: sectorOtherTrim || null, accountType } },
    })
    setBusy(false)

    if (error) { alert(error.message); return }

    if (!data.session) {
      setInfo('Account created. Check your email to confirm your account, then sign in.')
      setMode('login')
      setPassword('')
    }
    // If session exists, App's onAuthStateChange listener will pick it up automatically.
  }

  const handleLogin = async () => {
    setInfo(null)
    if (!email || !password) { alert('Please fill in all fields.'); return }

    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)

    if (error) { alert(error.message); return }
    // onAuthStateChange listener handles the rest.
  }

  return (
    <div className="auth-overlay">
      <div className="auth-container">
        <div className="auth-logo"><span className="logo-c">C</span>ompound</div>
        <div className="auth-accent-bar" />
        <div className="auth-tagline">Where industries and people connect</div>

        {mode === 'signup' ? (
          <div className="auth-card">
            <h2>Create your account</h2>

            <div className="account-type-grid">
              <div
                className={`type-option ${accountType === 'company' ? 'selected' : ''}`}
                onClick={() => setAccountType('company')}
              >
                <div className="type-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21V8l9-5 9 5v13" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </div>
                <div className="type-label">Company</div>
                <div className="type-desc">Organization profile</div>
              </div>
              <div
                className={`type-option ${accountType === 'individual' ? 'selected' : ''}`}
                onClick={() => setAccountType('individual')}
              >
                <div className="type-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="type-label">Individual</div>
                <div className="type-desc">Professional profile</div>
              </div>
            </div>

            <div className="form-group">
              <label>Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name or company name" />
            </div>
            <div className="form-group">
              <label>Work email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            {showPersonalEmailNotice && (
              <div className="auth-notice">
                You’re creating a company account with a personal email. Your account will be fully functional, but it will show as <strong>Verification Pending</strong> until we confirm your company is real. To speed up verification, you’ll be asked to provide a company website or social media link, or supporting documentation. Accounts using a corporate email (e.g., <code>you@yourcompany.com</code>) are verified automatically.
              </div>
            )}
            <div className="form-group">
              <label>Sector</label>
              <select value={sector} onChange={e => setSector(e.target.value)}>
                <option value="">Select your industry</option>
                {SECTORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {sector === 'other' && (
                <input
                  className="auth-sector-other"
                  type="text"
                  value={sectorOther}
                  onChange={e => setSectorOther(e.target.value)}
                  placeholder="Type your industry…"
                  maxLength={60}
                />
              )}
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>

            <button className="btn-primary" onClick={handleSignup} disabled={busy}>
              {busy ? 'Creating…' : 'Create Account'}
            </button>
            <div className="auth-switch">
              Already on Compound? <a onClick={() => setMode('login')}>Sign in</a>
            </div>
          </div>
        ) : (
          <div className="auth-card">
            <h2>Sign in to Compound</h2>
            {info && <div className="auth-info">{info}</div>}
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
            </div>
            <button className="btn-primary" onClick={handleLogin} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="auth-switch">
              New to Compound? <a onClick={() => setMode('signup')}>Create account</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Auth
