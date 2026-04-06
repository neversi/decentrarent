import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { apiFetch } from '../lib/api'
import type { AuthResponse } from '../features/auth/types'

const CHAT_LINES = [
  "Renting an apartment today means trusting strangers \u2014 deposits disappear, contracts are just paper, payments need manual tracking.",
  "We fix this with a smart contract on Solana \u2014 your deposit is locked on-chain, both sides sign digitally, rent is paid automatically.",
  "No middlemen. No trust required. Just code that guarantees both sides keep their word.",
  "Don't worry about crypto \u2014 we'll create a wallet for you automatically.",
]

export default function OnboardingNewbiePage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [step, setStep] = useState(1)
  const [lineIndex, setLineIndex] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mockWallet] = useState(() =>
    'DR' + Array.from({ length: 40 }, () => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 62)]).join('')
  )
  const [copied, setCopied] = useState(false)

  const showAllLines = lineIndex >= CHAT_LINES.length
  const visibleLines = CHAT_LINES.slice(0, lineIndex + 1)

  const handleNextLine = () => {
    if (lineIndex < CHAT_LINES.length - 1) {
      setLineIndex(lineIndex + 1)
    } else {
      setLineIndex(CHAT_LINES.length)
    }
  }

  const handleSignup = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please fill in both fields')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch<AuthResponse>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      login(res.token, res.user)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(mockWallet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Progress bar
  const progress = step / 4

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#0a0a0f', color: '#fff',
    }}>
      {/* Header with progress */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => {
              if (step === 1) navigate('/auth')
              else setStep(step - 1)
            }}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#8A8A9A', fontSize: 16, cursor: 'pointer',
            }}
          >
            {'\u2190'}
          </button>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${progress * 100}%`, height: '100%',
              background: 'linear-gradient(90deg, #E07840, #3DD68C)',
              borderRadius: 2, transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: '#5A5A6A', fontWeight: 600 }}>Step {step}/4</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column' }}>

        {/* ─── STEP 1: Explainer + Signup ─── */}
        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800,
              marginBottom: 24, letterSpacing: '-0.02em',
            }}>
              How it works
            </h1>

            {/* Chat-like messages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {visibleLines.map((line, i) => (
                <div key={i} style={{
                  background: 'rgba(224,120,64,0.06)',
                  border: '1px solid rgba(224,120,64,0.12)',
                  borderRadius: '4px 16px 16px 16px',
                  padding: '12px 16px',
                  maxWidth: '90%',
                  fontSize: 14, lineHeight: 1.6, color: '#d0d0d8',
                  animation: 'fadeSlideIn 0.3s ease',
                }}>
                  {line}
                </div>
              ))}
            </div>

            {!showAllLines ? (
              <button onClick={handleNextLine} style={{
                alignSelf: 'flex-start',
                padding: '10px 24px', borderRadius: 12,
                background: 'rgba(224,120,64,0.12)', border: '1px solid rgba(224,120,64,0.25)',
                color: '#E07840', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                Next {'\u2192'}
              </button>
            ) : (
              /* Signup form */
              <div style={{
                marginTop: 'auto', paddingBottom: 32,
                animation: 'fadeSlideIn 0.4s ease',
              }}>
                <h2 style={{
                  fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700,
                  marginBottom: 16,
                }}>
                  Create your account
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="text" placeholder="Username" value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    type="password" placeholder="Password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                    style={inputStyle}
                  />
                  {error && <p style={{ color: '#FF4D6A', fontSize: 13 }}>{error}</p>}
                  <button
                    onClick={handleSignup} disabled={loading}
                    style={{
                      padding: '14px', borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #E07840, #FF9500)',
                      color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                      fontFamily: "'DM Sans',sans-serif",
                      opacity: loading ? 0.7 : 1,
                      boxShadow: '0 8px 24px rgba(224,120,64,0.3)',
                    }}
                  >
                    {loading ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: Your Wallet ─── */}
        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83C\uDF89'}</div>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800,
              marginBottom: 8,
            }}>
              Your Crypto Wallet
            </h1>
            <p style={{ color: '#7A7A8A', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              This is your wallet address. You can receive funds and make payments with it.
            </p>

            {/* Wallet card */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '20px 16px', marginBottom: 16,
            }}>
              <p style={{ fontSize: 11, color: '#6A6A7A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Wallet Address</p>
              <p style={{ fontSize: 13, fontFamily: 'monospace', color: '#e2e8f0', wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 12 }}>
                {mockWallet}
              </p>
              <button onClick={handleCopy} style={{
                padding: '8px 16px', borderRadius: 8,
                background: copied ? 'rgba(61,214,140,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${copied ? 'rgba(61,214,140,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: copied ? '#3DD68C' : '#9A9AAA',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
            </div>

            {/* Balance */}
            <div style={{
              background: 'rgba(61,214,140,0.06)',
              border: '1px solid rgba(61,214,140,0.12)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 32,
            }}>
              <span style={{ color: '#7A7A8A', fontSize: 13 }}>Balance</span>
              <span style={{ color: '#3DD68C', fontWeight: 700, fontSize: 16 }}>0.00 SOL</span>
            </div>

            <button onClick={() => setStep(3)} style={primaryBtnStyle}>
              Next {'\u2192'}
            </button>
          </div>
        )}

        {/* ─── STEP 3: Fund Wallet (Mocked) ─── */}
        {step === 3 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800,
              marginBottom: 8, marginTop: 16,
            }}>
              Fund Your Wallet
            </h1>
            <p style={{ color: '#7A7A8A', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              Top up your wallet to start renting. More methods coming soon.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {[
                { icon: '\uD83D\uDCB3', label: 'Bank Card', sub: 'Visa, Mastercard' },
                { icon: '\uD83C\uDFE6', label: 'Bank Transfer', sub: 'SWIFT, SEPA' },
                { icon: '\u26A1', label: 'Crypto Transfer', sub: 'From another wallet' },
              ].map((m) => (
                <button key={m.label} style={{
                  padding: '16px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'background 0.2s',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: 'rgba(224,120,64,0.08)', border: '1px solid rgba(224,120,64,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>
                    {m.icon}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>{m.label}</p>
                    <p style={{ fontSize: 12, color: '#6A6A7A', marginTop: 2 }}>{m.sub}</p>
                  </div>
                  <div style={{ marginLeft: 'auto', color: '#5A5A6A' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: '#E07840',
                      background: 'rgba(224,120,64,0.1)', padding: '3px 8px', borderRadius: 6,
                    }}>Soon</span>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 'auto', paddingBottom: 32, display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(4)} style={{
                flex: 1, padding: '14px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#9A9AAA', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                Skip for now
              </button>
              <button onClick={() => setStep(4)} style={{ ...primaryBtnStyle, flex: 1 }}>
                Next {'\u2192'}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Welcome ─── */}
        {step === 4 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>{'\uD83C\uDF1F'}</div>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800,
              marginBottom: 12,
              background: 'linear-gradient(135deg, #F0F0F5, #E07840)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Welcome!
            </h1>
            <p style={{ color: '#7A7A8A', fontSize: 15, marginBottom: 40, lineHeight: 1.6 }}>
              You're all set. Let's find you a place to rent.
            </p>
            <button onClick={() => navigate('/listings')} style={{
              ...primaryBtnStyle,
              padding: '16px', fontSize: 16,
            }}>
              Explore Listings {'\u2192'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: 15, outline: 'none',
  fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '14px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg, #E07840, #FF9500)',
  color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif",
  boxShadow: '0 8px 24px rgba(224,120,64,0.3)',
}
