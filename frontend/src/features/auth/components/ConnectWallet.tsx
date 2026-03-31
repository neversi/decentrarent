import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { useAuthStore } from '../store';
import { apiFetch } from '../../../lib/api';
import type { AuthResponse } from '../types';

type View = 'login' | 'register';

export function ConnectWallet() {
  const { connected, publicKey, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const { signIn, signOut, isLoading: walletLoading, error: walletError } = useWalletAuth();
  const { isAuthenticated, login } = useAuthStore();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('login');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register form
  const [regUsername, setRegUsername] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regWallet, setRegWallet] = useState('');

  const walletConnectAttempted = useRef(false);

  // Auto-trigger sign-in when wallet connects after modal selection
  useEffect(() => {
    if (connected && publicKey && signMessage && walletConnectAttempted.current) {
      walletConnectAttempted.current = false;
      handleWalletConnect();
    }
  }, [connected, publicKey, signMessage]);

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  const handleLogin = async () => {
    if (!username || !password) {
      setFormError('Username and password are required');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      const res = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      login(res.token, res.user);
      navigate('/home', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regUsername || !regFirstName || !regLastName || !regEmail || !regPhone || !regPassword) {
      setFormError('All fields are required');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      const res = await apiFetch<AuthResponse>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: regUsername,
          first_name: regFirstName,
          last_name: regLastName,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
          wallet_address: regWallet || undefined,
        }),
      });
      login(res.token, res.user);
      navigate('/home', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleWalletConnect = async () => {
    if (!connected || !publicKey || !signMessage) {
      walletConnectAttempted.current = true;
      setVisible(true);
      return;
    }

    try {
      const result = await signIn();
      if (result === 'success') {
        navigate('/home', { replace: true });
      } else if (result === 'wallet_not_registered') {
        setRegWallet(publicKey.toBase58());
        setView('register');
        setFormError('');
      }
    } catch {
      // signIn already sets the error state
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#141416',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: '#7A7A8A',
    marginBottom: 4,
  };

  const btnPrimary: React.CSSProperties = {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#34D399',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  };

  const btnWallet: React.CSSProperties = {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#7C3AED',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  };

  const btnOutline: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#7A7A8A',
    fontSize: 14,
    cursor: 'pointer',
    padding: '8px 0',
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 24px', maxWidth: 420, margin: '0 auto' }}>

      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #E07840 0%, #7A3020 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(224,120,64,0.35)',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
            <path d="M9 21V12h6v9" />
          </svg>
        </div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>DecentraRent</h1>
        <p style={{ color: '#7A7A8A', fontSize: 14, marginTop: 6 }}>
          {view === 'login' ? 'Sign in to your account' : 'Create your account'}
        </p>
      </div>

      {/* Login View */}
      {view === 'login' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Username</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="your_username"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inputStyle, paddingRight: 48 }}
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button type="button" onClick={() => setShowPass(p => !p)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5A5A6A', padding: 4 }}>
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button onClick={handleLogin} disabled={formLoading} style={{ ...btnPrimary, opacity: formLoading ? 0.6 : 1 }}>
            {formLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 12, color: '#5A5A6A' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>

          <button onClick={handleWalletConnect} disabled={walletLoading}
            style={{ ...btnWallet, opacity: walletLoading ? 0.6 : 1 }}>
            {walletLoading ? 'Connecting...' : connected ? `Sign in with Wallet (${publicKey?.toBase58().slice(0, 4)}...)` : 'Connect Wallet'}
          </button>

          {connected && (
            <button onClick={() => { signOut(); disconnect(); }} style={btnOutline}>
              Disconnect wallet
            </button>
          )}

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button onClick={() => { setView('register'); setFormError(''); }} style={btnOutline}>
              Don't have an account? <span style={{ color: '#34D399' }}>Register</span>
            </button>
          </div>
        </div>
      )}

      {/* Register View */}
      {view === 'register' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>First name</label>
              <input style={inputStyle} placeholder="John" value={regFirstName} onChange={e => setRegFirstName(e.target.value)} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Last name</label>
              <input style={inputStyle} placeholder="Doe" value={regLastName} onChange={e => setRegLastName(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Username</label>
            <input style={inputStyle} placeholder="johndoe" value={regUsername} onChange={e => setRegUsername(e.target.value)} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" placeholder="john@example.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} type="tel" placeholder="+1 234 567 8900" value={regPhone} onChange={e => setRegPhone(e.target.value)} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" placeholder="••••••••" value={regPassword} onChange={e => setRegPassword(e.target.value)} />
          </div>

          {regWallet && (
            <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 12, color: '#a5b4fc' }}>
                Wallet will be linked: <strong>{regWallet.slice(0, 6)}...{regWallet.slice(-4)}</strong>
              </p>
            </div>
          )}

          <button onClick={handleRegister} disabled={formLoading} style={{ ...btnPrimary, opacity: formLoading ? 0.6 : 1 }}>
            {formLoading ? 'Creating account...' : 'Create Account'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <button onClick={() => { setView('login'); setFormError(''); setRegWallet(''); }} style={btnOutline}>
              Already have an account? <span style={{ color: '#34D399' }}>Sign In</span>
            </button>
          </div>
        </div>
      )}

      {/* Errors */}
      {(formError || walletError) && (
        <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 10, padding: '10px 14px', color: '#FF4D6A', fontSize: 13, marginTop: 16 }}>
          {formError || walletError}
        </div>
      )}
    </div>
  );
}
