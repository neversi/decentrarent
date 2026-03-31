import { useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getProgram } from '../program';
import { getEscrowPDA } from '../pda';
import { useTxStore } from '../store';

interface PayRentParams {
  landlordPubkey: string;
  orderId: string;
  amountLamports: number;
}

export function usePayRent() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { txState, setSigning, setConfirming, setConfirmed, setError, reset } =
    useTxStore();

  const payRent = useCallback(
    async (params: PayRentParams): Promise<string> => {
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
          .payRent(new BN(params.amountLamports))
          .accounts({
            tenant: wallet.publicKey,
            landlord,
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

  return { payRent, txState };
}
