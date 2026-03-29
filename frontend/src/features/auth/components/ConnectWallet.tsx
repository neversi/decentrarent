import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletAuth } from '../hooks/useWalletAuth';

export function ConnectWallet() {
  const { connected, publicKey, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const { signIn, signOut, isLoading, error, isAuthenticated } = useWalletAuth();
  const hasTriedAutoSign = useRef(false);

  // Auto-sign-in once when wallet connects and signMessage becomes available
  useEffect(() => {
    if (connected && publicKey && signMessage && !isAuthenticated && !isLoading && !hasTriedAutoSign.current) {
      hasTriedAutoSign.current = true;
      signIn();
    }
  }, [connected, publicKey, signMessage, isAuthenticated, isLoading, signIn]);

  // Reset the flag when wallet disconnects
  useEffect(() => {
    if (!connected) {
      hasTriedAutoSign.current = false;
    }
  }, [connected]);

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">
          {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
        </span>
        <button
          onClick={() => {
            signOut();
            disconnect();
          }}
          className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Wallet connected but not authenticated — show Sign In button as fallback
  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </span>
        <button
          onClick={() => {
            hasTriedAutoSign.current = false;
            signIn();
          }}
          disabled={isLoading || !signMessage}
          className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Signing...' : 'Sign In'}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  }

  // Not connected — show Connect Wallet button
  return (
    <button
      onClick={() => setVisible(true)}
      className="px-6 py-3 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 transition-colors"
    >
      Connect Wallet
    </button>
  );
}
