export const TOKEN_INFO: Record<string, { label: string; decimals: number; icon: string }> = {
  SOL:  { label: 'SOL',  decimals: 9, icon: '/tokens/SOL.png' },
  USDC: { label: 'USDC', decimals: 6, icon: '/tokens/USDC.png' },
  USDT: { label: 'USDT', decimals: 6, icon: '/tokens/USDT.png' },
}

/** Convert smallest unit (lamports etc.) to human-readable amount */
export function formatPrice(priceSmallest: number, tokenMint: string): string {
  const info = TOKEN_INFO[tokenMint] || TOKEN_INFO['SOL']
  const amount = priceSmallest / Math.pow(10, info.decimals)
  // Remove trailing zeros
  return amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)
}

/** Convert human-readable amount to smallest unit */
export function toSmallestUnit(amount: number, tokenMint: string): number {
  const info = TOKEN_INFO[tokenMint] || TOKEN_INFO['SOL']
  return Math.round(amount * Math.pow(10, info.decimals))
}
