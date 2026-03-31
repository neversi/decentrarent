# Escrow Contract Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend contract client that sends transactions to the Solana lease escrow program, with React hooks and transaction status tracking.

**Architecture:** Anchor `Program` wraps the IDL for type-safe instruction calls. React hooks call Anchor methods and update a Zustand store with transaction lifecycle (`signing → confirming → confirmed | error`). A root Taskfile.yml ties together all dev commands.

**Tech Stack:** `@coral-xyz/anchor`, `@solana/web3.js` (existing), `zustand` (existing), `go-task/task` (existing CLI)

---

### Task 1: Taskfile.yml

**Files:**
- Create: `Taskfile.yml`

- [ ] **Step 1: Create `Taskfile.yml`**

```yaml
version: '3'

tasks:
  up:
    desc: Start all services
    cmd: docker compose up -d

  down:
    desc: Stop all services
    cmd: docker compose down

  logs:
    desc: Tail all service logs
    cmd: docker compose logs -f

  db:reset:
    desc: Reset database (drops volume)
    cmds:
      - docker compose down -v
      - docker compose up -d db

  build:
    desc: Build Anchor program and sync IDL
    dir: blockchain/lease
    cmds:
      - anchor build
      - task: idl:copy

  deploy:
    desc: Deploy to devnet
    dir: blockchain/lease
    cmd: anchor deploy

  anchor:test:
    desc: Run Anchor integration tests
    dir: blockchain/lease
    cmd: anchor test

  idl:copy:
    desc: Copy IDL to frontend
    cmds:
      - mkdir -p frontend/src/features/escrow/idl
      - cp blockchain/lease/target/idl/lease.json frontend/src/features/escrow/idl/lease.json

  frontend:dev:
    desc: Start Vite dev server
    dir: frontend
    cmd: npm run dev

  frontend:install:
    desc: Install frontend dependencies
    dir: frontend
    cmd: npm install
```

- [ ] **Step 2: Verify Taskfile parses**

Run: `task --list`

Expected: All tasks listed with descriptions.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat: add Taskfile.yml for dev workflow"
```

---

### Task 2: Build Contract and Sync IDL

**Files:**
- Create: `frontend/src/features/escrow/idl/lease.json` (generated)

- [ ] **Step 1: Build the Anchor program**

Run: `cd blockchain/lease && anchor build`

Expected: Build succeeds. `blockchain/lease/target/idl/lease.json` is generated.

- [ ] **Step 2: Copy IDL to frontend**

Run: `task idl:copy`

Expected: `frontend/src/features/escrow/idl/lease.json` exists with the full IDL JSON.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/idl/lease.json
git commit -m "feat: add generated Anchor IDL for lease program"
```

---

### Task 3: Install `@coral-xyz/anchor`

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install the dependency**

Run: `cd frontend && npm install @coral-xyz/anchor`

- [ ] **Step 2: Verify it installed**

Run: `cd frontend && node -e "require('@coral-xyz/anchor')"`

Expected: No error.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add @coral-xyz/anchor dependency"
```

---

### Task 4: PDA Helper (`pda.ts`)

**Files:**
- Create: `frontend/src/features/escrow/pda.ts`

- [ ] **Step 1: Create `pda.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors related to `pda.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/pda.ts
git commit -m "feat: add PDA derivation and UUID conversion helpers"
```

---

### Task 5: Program Factory (`program.ts`)

**Files:**
- Create: `frontend/src/features/escrow/program.ts`

This task depends on Task 2 (IDL must exist) and Task 3 (`@coral-xyz/anchor` installed).

- [ ] **Step 1: Create `program.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors related to `program.ts`. If there's a JSON import error, add `"resolveJsonModule": true` to `tsconfig.app.json` compilerOptions.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/program.ts
git commit -m "feat: add Anchor program factory"
```

---

### Task 6: Transaction Status Store (`store.ts`)

**Files:**
- Create: `frontend/src/features/escrow/store.ts`

- [ ] **Step 1: Create `store.ts`**

```ts
import { create } from 'zustand';

export type TxStatus = 'idle' | 'signing' | 'confirming' | 'confirmed' | 'error';

export interface TxState {
  status: TxStatus;
  signature: string | null;
  error: string | null;
}

interface TxStore {
  txState: TxState;
  setSigning: () => void;
  setConfirming: (signature: string) => void;
  setConfirmed: () => void;
  setError: (error: string) => void;
  reset: () => void;
}

const initialState: TxState = {
  status: 'idle',
  signature: null,
  error: null,
};

export const useTxStore = create<TxStore>()((set) => ({
  txState: initialState,
  setSigning: () =>
    set({ txState: { status: 'signing', signature: null, error: null } }),
  setConfirming: (signature: string) =>
    set({ txState: { status: 'confirming', signature, error: null } }),
  setConfirmed: () =>
    set((state) => ({
      txState: { status: 'confirmed', signature: state.txState.signature, error: null },
    })),
  setError: (error: string) =>
    set((state) => ({
      txState: { status: 'error', signature: state.txState.signature, error },
    })),
  reset: () => set({ txState: initialState }),
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/store.ts
git commit -m "feat: add transaction status Zustand store"
```

---

### Task 7: `useLockDeposit` Hook

**Files:**
- Create: `frontend/src/features/escrow/hooks/useLockDeposit.ts`

- [ ] **Step 1: Create `useLockDeposit.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/hooks/useLockDeposit.ts
git commit -m "feat: add useLockDeposit hook"
```

---

### Task 8: `useLandlordSign` Hook

**Files:**
- Create: `frontend/src/features/escrow/hooks/useLandlordSign.ts`

- [ ] **Step 1: Create `useLandlordSign.ts`**

```ts
import { useCallback } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../program';
import { getEscrowPDA } from '../pda';
import { useTxStore } from '../store';

interface LandlordSignParams {
  tenantPubkey: string;
  orderId: string;
}

export function useLandlordSign() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { txState, setSigning, setConfirming, setConfirmed, setError, reset } =
    useTxStore();

  const landlordSign = useCallback(
    async (params: LandlordSignParams): Promise<string> => {
      if (!wallet) {
        setError('Wallet not connected');
        throw new Error('Wallet not connected');
      }

      reset();
      setSigning();

      try {
        const program = getProgram(connection, wallet);
        const tenant = new PublicKey(params.tenantPubkey);
        const [escrowPDA] = getEscrowPDA(wallet.publicKey, tenant, params.orderId);

        const signature = await program.methods
          .landlordSign()
          .accounts({
            landlord: wallet.publicKey,
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

  return { landlordSign, txState };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/hooks/useLandlordSign.ts
git commit -m "feat: add useLandlordSign hook"
```

---

### Task 9: `useTenantSign` Hook

**Files:**
- Create: `frontend/src/features/escrow/hooks/useTenantSign.ts`

- [ ] **Step 1: Create `useTenantSign.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/hooks/useTenantSign.ts
git commit -m "feat: add useTenantSign hook"
```

---

### Task 10: `usePayRent` Hook

**Files:**
- Create: `frontend/src/features/escrow/hooks/usePayRent.ts`

- [ ] **Step 1: Create `usePayRent.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/escrow/hooks/usePayRent.ts
git commit -m "feat: add usePayRent hook"
```
