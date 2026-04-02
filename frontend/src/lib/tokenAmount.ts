/**
 * Token Amount Utilities
 *
 * All prices and amounts that interact with the Solana blockchain are stored
 * and transmitted as integers in their smallest denomination (base units):
 *
 *   SOL  → lamports   (1 SOL  = 1,000,000,000 lamports  = 10^9)
 *   USDC → micro-USDC (1 USDC = 1,000,000 micro-USDC     = 10^6)
 *   USDT → micro-USDT (1 USDT = 1,000,000 micro-USDT     = 10^6)
 *
 * Rule:
 *   - Store / send to backend / pass to Anchor program → base units (integer)
 *   - Display to the user                              → human-readable (divide by decimals)
 *   - Accept from user input                           → human-readable (multiply before sending)
 */

const DECIMALS: Record<string, number> = {
  SOL: 1_000_000_000,
  USDC: 1_000_000,
  USDT: 1_000_000,
};

function decimalsFor(tokenMint: string): number {
  return DECIMALS[tokenMint] ?? 1_000_000_000;
}

/**
 * Convert a raw on-chain base-unit amount to a human-readable display string.
 *
 * @example toDisplayAmount(1_000_000_000, 'SOL') // '1'
 * @example toDisplayAmount(2_500_000, 'USDC')    // '2.5'
 */
export function toDisplayAmount(baseUnits: number, tokenMint: string): string {
  return String(baseUnits / decimalsFor(tokenMint));
}

/**
 * Convert a human-readable user-entered amount to raw base units for the chain.
 *
 * @example toBaseUnits(1, 'SOL')   // 1_000_000_000
 * @example toBaseUnits(2.5, 'USDC') // 2_500_000
 */
export function toBaseUnits(displayAmount: number, tokenMint: string): number {
  return Math.round(displayAmount * decimalsFor(tokenMint));
}
