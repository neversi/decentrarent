import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from './features/escrow/idl/lease.json';
import { getEscrowPDA } from './features/escrow/pda';

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const provider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
const program = new Program(idl as any, provider);

function bytesToUuid(bytes: number[]): string {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const dr = {
  /** Fetch and deserialize an EscrowAccount by its on-chain address */
  fetchEscrow: async (address: string) => {
    const data = await program.account.escrowAccount.fetch(new PublicKey(address));
    console.table({
      orderId:        bytesToUuid(data.orderId),
      landlord:       data.landlord.toBase58(),
      tenant:         data.tenant.toBase58(),
      authority:      data.authority.toBase58(),
      status:         Object.keys(data.status)[0],
      depositAmount:  data.depositAmount.toNumber(),
      totalRentPaid:  data.totalRentPaid.toNumber(),
      priceRent:      data.priceRent.toNumber(),
      landlordSigned: data.landlordSigned,
      tenantSigned:   data.tenantSigned,
      createdAt:      new Date(data.createdAt.toNumber() * 1000).toISOString(),
      deadline:       new Date(data.deadline.toNumber() * 1000).toISOString(),
      startDate:      new Date(data.startDate.toNumber() * 1000).toISOString(),
      endDate:        new Date(data.endDate.toNumber() * 1000).toISOString(),
      period:         data.period.toNumber(),
      bump:           data.bump,
    });
    return data;
  },

  /** Derive the escrow PDA from landlord + tenant pubkeys and order UUID */
  getEscrowPDA: (landlord: string, tenant: string, orderId: string) => {
    const [pda, bump] = getEscrowPDA(new PublicKey(landlord), new PublicKey(tenant), orderId);
    console.log('PDA:', pda.toBase58(), '  bump:', bump);
    return pda;
  },
};

(window as any).dr = dr;

console.log(
  '%c[DecentraRent devtools] %cwindow.dr is ready\n' +
  '  dr.fetchEscrow("<address>")\n' +
  '  dr.getEscrowPDA("<landlord>", "<tenant>", "<uuid>")',
  'color:#9945FF;font-weight:bold',
  'color:#14F195',
);
