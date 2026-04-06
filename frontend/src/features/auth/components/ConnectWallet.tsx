import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuthStore } from '../store';
import { apiFetch } from '../../../lib/api';
import type { AuthResponse } from '../types';

export function ConnectWallet() {
  const navigate = useNavigate();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { login } = useAuthStore();
  const walletConnectIntent = useRef(false);

  // After wallet connects, navigate to onboarding/wallet
  useEffect(() => {
    if (connected && publicKey && walletConnectIntent.current) {
      walletConnectIntent.current = false;
      navigate('/onboarding/wallet');
    }
  }, [connected, publicKey, navigate]);

  const [showSignIn, setShowSignIn] = useState(false);
  const [signInUser, setSignInUser] = useState('');
  const [signInPass, setSignInPass] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);

  const handleLogin = async () => {
    if (!signInUser.trim() || !signInPass.trim()) {
      setSignInError('Please fill in both fields');
      return;
    }
    setSignInLoading(true);
    setSignInError('');
    try {
      const res = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: signInUser.trim(), password: signInPass }),
      });
      login(res.token, res.user);
      navigate('/home');
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSignInLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', background: '#0a0a0f', color: '#fff',
    }}>
      {/* Hero */}
      <div style={{ position: 'relative' }}>
        <img
          src="/hero.png"
          alt="Onboarding"
          style={{ width: '100%', height: '48vh', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, #0a0a0f 100%)',
        }} />
      </div>

      {/* Content */}
      <div style={{ padding: '24px 20px 32px' }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, marginBottom: 8,
          fontFamily: "'Syne', sans-serif",
          background: 'linear-gradient(135deg, #F0F0F5, #B0B0BA)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Let's get you started
        </h1>
        <p style={{ color: '#7A7A8A', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Rent apartments securely with smart contracts and automated payments
        </p>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* New to Crypto */}
          <button
            onClick={() => navigate('/onboarding/newbie')}
            style={{
              padding: '18px 16px', borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(224,120,64,0.08), rgba(224,120,64,0.02))',
              border: '1px solid rgba(224,120,64,0.15)',
              textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(224,120,64,0.12)', border: '1px solid rgba(224,120,64,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>{'\uD83C\uDF31'}</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#F0F0F5' }}>I'm new to crypto</p>
                <p style={{ fontSize: 12, color: '#7A7A8A', marginTop: 3 }}>Step-by-step guide, we create a wallet for you</p>
              </div>
            </div>
          </button>

          {/* Already have a wallet */}
          <button
            onClick={() => {
              if (connected) {
                navigate('/onboarding/wallet');
              } else {
                walletConnectIntent.current = true;
                setVisible(true);
              }
            }}
            style={{
              padding: '18px 16px', borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(153,69,255,0.08), rgba(153,69,255,0.02))',
              border: '1px solid rgba(153,69,255,0.15)',
              textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(153,69,255,0.12)', border: '1px solid rgba(153,69,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>{'\uD83D\uDD11'}</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#F0F0F5' }}>
                  {connected ? `Connected: ${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}` : 'I already have a wallet'}
                </p>
                <p style={{ fontSize: 12, color: '#7A7A8A', marginTop: 3 }}>Connect Phantom, Solflare, or other wallet</p>
              </div>
            </div>
          </button>
        </div>

        {/* Sign in link */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => setShowSignIn(true)}
            style={{
              background: 'none', border: 'none',
              color: '#7A7A8A', fontSize: 14, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            Already have an account?{' '}
            <span style={{ color: '#3DD68C', fontWeight: 600 }}>Sign in</span>
          </button>
        </div>
      </div>

      {/* Sign-in Bottom Sheet */}
      {showSignIn && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', zIndex: 2000,
          }}
          onClick={() => setShowSignIn(false)}
        >
          <div
            style={{
              width: '100%', background: '#0d0d14', borderRadius: '24px 24px 0 0',
              padding: '28px 20px 36px',
              animation: 'sheetUp 0.3s ease',
              border: '1px solid rgba(255,255,255,0.06)',
              borderBottom: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginBottom: 20 }}>
              Welcome back
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <input
                type="text" placeholder="Username" value={signInUser}
                onChange={(e) => setSignInUser(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password" placeholder="Password" value={signInPass}
                onChange={(e) => setSignInPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                style={inputStyle}
              />
              {signInError && <p style={{ color: '#FF4D6A', fontSize: 13 }}>{signInError}</p>}
            </div>

            <button onClick={handleLogin} disabled={signInLoading} style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #3DD68C, #34C759)',
              color: '#0a0a0f', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
              opacity: signInLoading ? 0.7 : 1,
              boxShadow: '0 8px 24px rgba(61,214,140,0.25)',
            }}>
              {signInLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: 15, outline: 'none',
  fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
};
