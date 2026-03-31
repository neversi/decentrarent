import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY');

export { PROGRAM_ID };

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function getEscrowPDA(
  landlord: PublicKey,
  tenant: PublicKey,
  orderId: string,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('escrow'),
      landlord.toBytes(),
      tenant.toBytes(),
      uuidToBytes(orderId),
    ],
    PROGRAM_ID,
  );
}
