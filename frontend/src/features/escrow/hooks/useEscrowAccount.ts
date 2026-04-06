import { useEffect, useState, useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../program';
import { getEscrowPDA } from '../pda';

export interface EscrowAccountData {
  landlordSigned: boolean;
  tenantSigned: boolean;
  status: Record<string, object>;
}

export function useEscrowAccount(
  landlordPubkey: string | null,
  tenantPubkey: string | null,
  orderId: string | null,
) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [data, setData] = useState<EscrowAccountData | null>(null);

  const fetch = useCallback(async () => {
    console.log('Fetching escrow account with:', { landlordPubkey, tenantPubkey, orderId });

    if (!wallet || !landlordPubkey || !tenantPubkey || !orderId) return;
    try {
      const program = getProgram(connection, wallet);
      const landlord = new PublicKey(landlordPubkey);
      const tenant = new PublicKey(tenantPubkey);
      const [escrowPDA] = getEscrowPDA(landlord, tenant, orderId);
      const account = await program.account.escrowAccount.fetch(escrowPDA);
      setData({
        landlordSigned: account.landlordSigned as boolean,
        tenantSigned: account.tenantSigned as boolean,
        status: account.status as Record<string, object>,
      });
    } catch {
      setData(null);
    }
  }, [connection, wallet, landlordPubkey, tenantPubkey, orderId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { escrowData: data, refetchEscrow: fetch };
}
