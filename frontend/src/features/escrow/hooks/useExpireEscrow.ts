import { useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../program';
import { getEscrowPDA } from '../pda';
import { useTxStore } from '../store';

interface ExpireEscrowParams {
  landlordPubkey: string;
  tenantPubkey: string;
  orderId: string;
}

export function useExpireEscrow() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { txState, setSigning, setConfirming, setConfirmed, setError, reset } =
    useTxStore();

  const expireEscrow = useCallback(
    async (params: ExpireEscrowParams): Promise<string> => {
      if (!wallet) {
        setError('Wallet not connected');
        throw new Error('Wallet not connected');
      }

      reset();
      setSigning();

      try {
        const program = getProgram(connection, wallet);
        const landlord = new PublicKey(params.landlordPubkey);
        const tenant = new PublicKey(params.tenantPubkey);
        const [escrowPDA] = getEscrowPDA(landlord, tenant, params.orderId);

        const signature = await program.methods
          .expireEscrow()
          .accounts({
            authority: wallet.publicKey,
            tenant,
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

  return { expireEscrow, txState };
}
