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
