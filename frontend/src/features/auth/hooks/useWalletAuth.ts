import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { useAuthStore } from '../store';
import { apiFetch } from '../../../lib/api';
import type { NonceResponse, AuthResponse } from '../types';

export function useWalletAuth() {
  const { publicKey, signMessage } = useWallet();
  const { login, logout, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const walletAddress = publicKey.toBase58();

      // 1. Get nonce from backend
      const { nonce, message } = await apiFetch<NonceResponse>(
        `/auth/nonce?wallet=${walletAddress}`,
      );

      // 2. Sign the message with wallet
      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);

      // 3. Convert signature to base58
      const signatureBase58 = bs58.encode(signatureBytes);

      // 4. Verify with backend
      const authResponse = await apiFetch<AuthResponse>('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({
          wallet: walletAddress,
          signature: signatureBase58,
          nonce,
        }),
      });

      // 5. Store JWT and user
      login(authResponse.token, authResponse.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage, login]);

  const signOut = useCallback(() => {
    logout();
  }, [logout]);

  return { signIn, signOut, isLoading, error, isAuthenticated };
}
