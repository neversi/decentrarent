import { useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../program';
import { getEscrowPDA } from '../pda';
import { useTxStore } from '../store';

interface ReleaseDepositParams {
  landlordPubkey: string;
  tenantPubkey: string;
  orderId: string;
}

export function useReleaseDeposit() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { txState, setSigning, setConfirming, setConfirmed, setError, reset } =
    useTxStore();

  const releaseDeposit = useCallback(
    async (params: ReleaseDepositParams): Promise<string> => {
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

        const latestBlockhash = await connection.getLatestBlockhash();

        const signature = await program.methods
          .releaseDepositToTenant()
          .accounts({
            authority: wallet.publicKey,
            tenant,
            landlord,
            escrow: escrowPDA,
          })
          .rpc();

        setConfirming(signature);
        await connection.confirmTransaction(
          { signature, ...latestBlockhash },
          'confirmed',
        );
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

  return { releaseDeposit, txState };
}
