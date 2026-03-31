import { type Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import idl from './idl/lease.json';
import { PROGRAM_ID } from './pda';

export function getProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new Program(idl as Idl, provider);
}

export { PROGRAM_ID };
