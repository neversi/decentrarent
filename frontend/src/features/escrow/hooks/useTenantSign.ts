import { useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../program';
import { getEscrowPDA } from '../pda';
import { useTxStore } from '../store';

interface TenantSignParams {
  landlordPubkey: string;
  orderId: string;
}

export function useTenantSign() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { txState, setSigning, setConfirming, setConfirmed, setError, reset } =
    useTxStore();

  const tenantSign = useCallback(
    async (params: TenantSignParams): Promise<string> => {
      if (!wallet) {
        setError('Wallet not connected');
        throw new Error('Wallet not connected');
      }

      reset();
      setSigning();

      try {
        const program = getProgram(connection, wallet);
        const landlord = new PublicKey(params.landlordPubkey);
        const [escrowPDA] = getEscrowPDA(landlord, wallet.publicKey, params.orderId);

        const signature = await program.methods
          .tenantSign()
          .accounts({
            tenant: wallet.publicKey,
            escrow: escrowPDA,
          })
          .rpc();

        setConfirming(signature);
        await connection.confirmTransaction(signature, 'confirmed');
        setConfirmed();
        return signature;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Transaction failed';
        setError(message);
        throw err;
      }
    },
    [connection, wallet, setSigning, setConfirming, setConfirmed, setError, reset],
  );

  return { tenantSign, txState };
}
