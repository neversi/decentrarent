import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletAuth } from '../hooks/useWalletAuth';

export function ConnectWallet() {
  const { connected, publicKey, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const { signIn, signOut, isLoading, error, isAuthenticated } = useWalletAuth();
  const navigate = useNavigate();
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const hasTriedAutoSign = useRef(false);

  // Auto-sign-in once when wallet connects and signMessage becomes available
  useEffect(() => {
    // keep ready state when wallet connects; user must explicitly click "Sign In"
    if (!connected) {
      hasTriedAutoSign.current = false;
    }
  }, [connected, publicKey, signMessage, isAuthenticated, isLoading, signIn]);

  // (No auto sign-in) - user action required


  const handleLogin = async () => {
    if (!email || !password) {
      setFormError('Please fill in all fields');
      return;
    }
    if (!connected || !publicKey || !signMessage) {
      setFormError('Wallet not connected; please connect wallet first');
      return;
    }

    setFormLoading(true);
    setFormError('');
    try {
      await signIn();
      navigate('/home', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setFormLoading(false);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }


  // Now render auth page with form and wallet actions below

  // Not connected — show Connect Wallet button
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 24px' }}>

      <div style={{ marginBottom: 52, textAlign: 'center' }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #E07840 0%, #7A3020 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(224,120,64,0.35)',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
            <path d="M9 21V12h6v9" />
          </svg>
        </div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>DecentraRent</h1>
        <p style={{ color: '#7A7A8A', fontSize: 14, marginTop: 6 }}>Wallet-based authentication for property rental</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="input-label">Email address</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(prev => !prev)}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#5A5A6A',
                  padding: 4,
                }}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button
            onClick={handleLogin}
            disabled={formLoading || isLoading}
            style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            {formLoading || isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        {connected && publicKey ? (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 14, color: '#a5b4fc' }}>
              Connected wallet: <strong>{publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}</strong>
            </p>
            <button
              onClick={() => {
                signOut();
                disconnect();
              }}
              style={{ marginTop: 10, width: '100%', padding: '10px 16px', borderRadius: 10, background: 'transparent', color: '#ddd', border: '1px solid #444' }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setVisible(true)}
            style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Connect Wallet
          </button>
        )}

        {(formError || error) && (
          <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 10, padding: '10px 14px', color: '#FF4D6A', fontSize: 13 }}>
            {formError || error}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button style={{ background: 'none', border: 'none', color: '#5A5A6A', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }} onClick={() => setShowPass(!showPass)}>
          {showPass ? 'Hide extra info' : 'Why wallet login?'}
        </button>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
