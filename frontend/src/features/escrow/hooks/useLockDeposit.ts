import { useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getProgram } from '../program';
import { getEscrowPDA, uuidToBytes } from '../pda';
import { useTxStore } from '../store';

interface LockDepositParams {
  orderId: string;
  landlordPubkey: string;
  authorityPubkey: string;
  depositLamports: number;
  deadlineTs: number;
}

export function useLockDeposit() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { txState, setSigning, setConfirming, setConfirmed, setError, reset } =
    useTxStore();

  const lockDeposit = useCallback(
    async (params: LockDepositParams): Promise<string> => {
      if (!wallet) {
        setError('Wallet not connected');
        throw new Error('Wallet not connected');
      }

      reset();
      setSigning();

      try {
        const program = getProgram(connection, wallet);
        const landlord = new PublicKey(params.landlordPubkey);
        const authority = new PublicKey(params.authorityPubkey);
        const orderIdBytes = uuidToBytes(params.orderId);
        const [escrowPDA] = getEscrowPDA(landlord, wallet.publicKey, params.orderId);

        const signature = await program.methods
          .lockDeposit(
            Array.from(orderIdBytes) as unknown as number[],
            new BN(params.depositLamports),
            new BN(params.deadlineTs),
          )
          .accounts({
            tenant: wallet.publicKey,
            landlord,
            authority,
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

  return { lockDeposit, txState };
}
