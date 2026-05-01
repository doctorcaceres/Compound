import { useState } from 'react'
import './Auth.css'

const SECTORS = [
  { value: 'energy', label: 'Energy & Power' },
  { value: 'infrastructure', label: 'Infrastructure & Construction' },
  { value: 'maritime', label: 'Maritime & Logistics' },
  { value: 'manufacturing', label: 'Advanced Manufacturing' },
  { value: 'climate', label: 'Climate Tech' },
  { value: 'mining', label: 'Mining & Resources' },
  { value: 'finance', label: 'Industrial Finance' },
  { value: 'defense', label: 'Defense & Aerospace' },
  { value: 'tech', label: 'Technology' },
  { value: 'other', label: 'Other' },
]

const PERSONAL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com']

function Auth({ onLogin }) {
  const [mode, setMode] = useState('signup')
  const [accountType, setAccountType] = useState('company')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sector, setSector] = useState('')
  const [password, setPassword] = useState('')

  const handleSignup = () => {
    if (!name || !email || !password) { alert('Please fill in all fields.'); return }
    if (password.length < 8) { alert('Password must be at least 8 characters.'); return }
    const domain = email.split('@')[1]
    if (accountType === 'company' && PERSONAL_DOMAINS.includes(domain)) {
      alert('Company accounts require a company email address.')
      return
    }
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    onLogin({ name, email, sector, accountType, initials })
  }

  const handleLogin = () => {
    if (!email || !password) { alert('Please fill in all fields.'); return }
    const initials = email.slice(0, 2).toUpperCase()
    onLogin({ name: email.split('@')[0], email, sector: 'energy', accountType: 'company', initials })
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
                <div className="type-icon">&#9670;</div>
                <div className="type-label">Company</div>
                <div className="type-desc">Organization profile</div>
              </div>
              <div
                className={`type-option ${accountType === 'individual' ? 'selected' : ''}`}
                onClick={() => setAccountType('individual')}
              >
                <div className="type-icon">&#9679;</div>
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
            <div className="form-group">
              <label>Sector</label>
              <select value={sector} onChange={e => setSector(e.target.value)}>
                <option value="">Select your industry</option>
                {SECTORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>

            <button className="btn-primary" onClick={handleSignup}>Create Account</button>
            <div className="auth-switch">
              Already on Compound? <a onClick={() => setMode('login')}>Sign in</a>
            </div>
          </div>
        ) : (
          <div className="auth-card">
            <h2>Sign in to Compound</h2>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
            </div>
            <button className="btn-primary" onClick={handleLogin}>Sign In</button>
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
