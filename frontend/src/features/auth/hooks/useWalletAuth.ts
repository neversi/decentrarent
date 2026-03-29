import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { useAuthStore } from '../store';
import { apiFetch } from '../../../lib/api';
import type { NonceResponse, AuthResponse } from '../types';

export type WalletAuthResult = 'success' | 'wallet_not_registered';

export function useWalletAuth() {
  const { publicKey, signMessage } = useWallet();
  const { login, logout, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (): Promise<WalletAuthResult> => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected');
      return 'wallet_not_registered';
    }

    setIsLoading(true);
    setError(null);

    try {
      const walletAddress = publicKey.toBase58();

      const { nonce, message } = await apiFetch<NonceResponse>(
        `/auth/nonce?wallet=${walletAddress}`,
      );

      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);
      const signatureBase58 = bs58.encode(signatureBytes);

      const authResponse = await apiFetch<AuthResponse>('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({
          wallet: walletAddress,
          signature: signatureBase58,
          nonce,
        }),
      });

      login(authResponse.token, authResponse.user);
      return 'success';
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'wallet_not_registered') {
        return 'wallet_not_registered';
      }
      setError(msg || 'Authentication failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage, login]);

  const signOut = useCallback(() => {
    logout();
  }, [logout]);

  return { signIn, signOut, isLoading, error, isAuthenticated };
}
