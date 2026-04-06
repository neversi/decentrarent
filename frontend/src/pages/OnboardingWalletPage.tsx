import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuthStore } from '../features/auth/store'
import { apiFetch } from '../lib/api'
import type { AuthResponse } from '../features/auth/types'

export default function OnboardingWalletPage() {
  const navigate = useNavigate()
  const { publicKey, connected, disconnect } = useWallet()
  const { connection } = useConnection()
  const { login } = useAuthStore()

  const [step, setStep] = useState(1) // 1 = balance + signup, 2 = welcome
  const [balance, setBalance] = useState<number | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const walletAddress = publicKey?.toBase58() || ''
  const walletShort = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : ''

  // Redirect back if wallet not connected
  useEffect(() => {
    if (!connected) navigate('/auth')
  }, [connected, navigate])

  // Fetch balance
  useEffect(() => {
    if (!publicKey || !connection) return
    connection.getBalance(publicKey).then((bal) => {
      setBalance(bal / LAMPORTS_PER_SOL)
    }).catch(() => setBalance(0))
  }, [publicKey, connection])

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        body: JSON.stringify({
          username: username.trim(),
          password,
          wallet_address: walletAddress,
        }),
      })
      login(res.token, res.user)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const progress = step / 2

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
              if (step === 1) { disconnect(); navigate('/auth'); }
              else setStep(1)
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
              background: 'linear-gradient(90deg, #9945FF, #3DD68C)',
              borderRadius: 2, transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: '#5A5A6A', fontWeight: 600 }}>Step {step}/2</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column' }}>

        {/* ─── STEP 1: Balance + Signup ─── */}
        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800,
              marginBottom: 8, letterSpacing: '-0.02em',
            }}>
              Wallet Connected
            </h1>
            <p style={{ color: '#7A7A8A', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              Great! Here's your wallet. Create an account to get started.
            </p>

            {/* Wallet card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(153,69,255,0.08), rgba(153,69,255,0.02))',
              border: '1px solid rgba(153,69,255,0.15)',
              borderRadius: 16, padding: '20px 16px', marginBottom: 20,
            }}>
              {/* Address */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 10, color: '#7A7A8A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Wallet Address</p>
                  <p style={{ fontSize: 14, fontFamily: 'monospace', color: '#e2e8f0' }}>{walletShort}</p>
                </div>
                <button onClick={handleCopy} style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: copied ? 'rgba(61,214,140,0.12)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${copied ? 'rgba(61,214,140,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  color: copied ? '#3DD68C' : '#9A9AAA',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Balance */}
              <div style={{
                background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '14px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: '#7A7A8A', fontSize: 13 }}>Balance</span>
                <span style={{ color: '#3DD68C', fontWeight: 700, fontSize: 18, fontFamily: "'Syne',sans-serif" }}>
                  {balance !== null ? balance.toFixed(4) : '...'} SOL
                </span>
              </div>
            </div>

            {/* Signup form */}
            <div style={{ marginTop: 'auto', paddingBottom: 32 }}>
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
                    background: 'linear-gradient(135deg, #9945FF, #7C3AED)',
                    color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                    fontFamily: "'DM Sans',sans-serif",
                    opacity: loading ? 0.7 : 1,
                    boxShadow: '0 8px 24px rgba(153,69,255,0.3)',
                  }}
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Welcome ─── */}
        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>{'\uD83C\uDF1F'}</div>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800,
              marginBottom: 12,
              background: 'linear-gradient(135deg, #F0F0F5, #9945FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              You're all set!
            </h1>
            <p style={{ color: '#7A7A8A', fontSize: 15, marginBottom: 40, lineHeight: 1.6 }}>
              Your wallet is connected and your account is ready. Let's find you a place to rent.
            </p>
            <button onClick={() => navigate('/listings')} style={{
              padding: '16px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #9945FF, #7C3AED)',
              color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: '0 8px 24px rgba(153,69,255,0.3)',
            }}>
              Explore Listings {'\u2192'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: 15, outline: 'none',
  fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
}
