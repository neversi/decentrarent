import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuthStore } from '../features/auth/store'
import { listProperties } from '../features/properties/api'
import { apiFetch } from '../lib/api'
import { toDisplayAmount } from '../lib/tokenAmount'
import type { Property } from '../features/properties/types'
import type { Conversation } from '../features/chat/types'

interface OrderWithUSDT {
  id: string
  conversation_id: string
  property_id: string
  escrow_status: string
  rent_amount: number
  deposit_amount: number
  rent_amount_usdt: number
  deposit_amount_usdt: number
  token_mint: string
  rent_start_date: string
  rent_end_date: string
  created_at: string
  property?: Property
}

interface OrdersResponse {
  orders: OrderWithUSDT[]
  sol_price_usdt: number
  price_updated_at: string
}

// Escrow status colors
const ESCROW_STATUS_COLORS: Record<string, { rentColor: string; depositColor: string; bg: string; border: string; label: string }> = {
  new: { rentColor: '#8A8A9A', depositColor: '#8A8A9A', bg: 'rgba(138,138,154,0.08)', border: 'rgba(138,138,154,0.2)', label: 'New' },
  awaiting_deposit: { rentColor: '#8A8A9A', depositColor: '#8A8A9A', bg: 'rgba(138,138,154,0.08)', border: 'rgba(138,138,154,0.2)', label: 'Awaiting Deposit' },
  awaiting_signatures: { rentColor: '#FF9500', depositColor: '#FF9500', bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.2)', label: 'Awaiting Signatures' },
  active: { rentColor: '#34C759', depositColor: '#E07840', bg: 'rgba(52,199,89,0.08)', border: 'rgba(52,199,89,0.2)', label: 'Active' },
  settled: { rentColor: '#34C759', depositColor: '#34C759', bg: 'rgba(52,199,89,0.08)', border: 'rgba(52,199,89,0.2)', label: 'Settled' },
  expired: { rentColor: '#FF4D6A', depositColor: '#FF4D6A', bg: 'rgba(255,77,106,0.08)', border: 'rgba(255,77,106,0.2)', label: 'Expired' },
  rejected: { rentColor: '#FF4D6A', depositColor: '#FF4D6A', bg: 'rgba(255,77,106,0.08)', border: 'rgba(255,77,106,0.2)', label: 'Rejected' },
  disputed: { rentColor: '#FF9500', depositColor: '#FF9500', bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.2)', label: 'Disputed' },
  dispute_resolved_tenant: { rentColor: '#34C759', depositColor: '#34C759', bg: 'rgba(52,199,89,0.08)', border: 'rgba(52,199,89,0.2)', label: 'Resolved (Tenant)' },
  dispute_resolved_landlord: { rentColor: '#34C759', depositColor: '#34C759', bg: 'rgba(52,199,89,0.08)', border: 'rgba(52,199,89,0.2)', label: 'Resolved (Landlord)' },
}

const DEFAULT_ESCROW_COLORS = { rentColor: '#8A8A9A', depositColor: '#8A8A9A', bg: 'rgba(138,138,154,0.08)', border: 'rgba(138,138,154,0.2)', label: 'Pending' }

export default function HomePage() {
  const { user, token, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [listings, setListings] = useState<Property[]>([])
  const [orders, setOrders] = useState<OrderWithUSDT[]>([])
  const [solPrice, setSolPrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth')
      return
    }
    if (!user || !token) return

    setLoading(true)
    Promise.all([
      listProperties({ owner: user.id }, token).catch(() => []),
      fetch('/api/orders', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .catch(() => ({ orders: [], sol_price_usdt: 0 })),
    ])
      .then(([props, ordersData]: [Property[], OrdersResponse]) => {
        setListings(props)
        setOrders(Array.isArray(ordersData.orders) ? ordersData.orders : [])
        if (ordersData.sol_price_usdt > 0) setSolPrice(ordersData.sol_price_usdt)
      })
      .finally(() => setLoading(false))
  }, [isAuthenticated, navigate, user, token])

  useEffect(() => {
    if (!publicKey) return
    connection.getBalance(publicKey).then((bal) => {
      setWalletBalance(bal / LAMPORTS_PER_SOL)
    }).catch(() => setWalletBalance(null))
  }, [publicKey, connection])

  const handleTransactionClick = async (order: OrderWithUSDT) => {
    try {
      const conversation = await apiFetch<Conversation>(`/conversations/${order.conversation_id}`, {}, token)
      navigate('/chat', { state: { conversation } })
    } catch (err) {
      console.error('Failed to load conversation:', err)
      navigate('/chat')
    }
  }

  const [walletCopied, setWalletCopied] = useState(false)

  const owlIndex = user ? (user.id.charCodeAt(0) + user.id.charCodeAt(1)) % 20 + 1 : 1
  const owlFile = owlIndex === 10
    ? `Owl - All versions-${String(owlIndex).padStart(2, '0')}.jpg`
    : `Owl - All versions-${String(owlIndex).padStart(2, '0')}.png`

  if (!user) return <div style={{ padding: '20px', color: '#ddd' }}>Loading your dashboard...</div>

  const displayName = user.display_name || user.wallet_address?.slice(0, 8) || 'User'
  const walletShort = user.wallet_address
    ? `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`
    : ''

  const handleCopyWallet = () => {
    if (!user.wallet_address) return
    navigator.clipboard.writeText(user.wallet_address)
    setWalletCopied(true)
    setTimeout(() => setWalletCopied(false), 2000)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const totalListings = listings.length
  const assetsRented = listings.filter(l => l.status === 'rented').length

  // Total Value Locked = only deposits in escrow (rent goes directly to landlord, not locked)
  const lockedOrders = orders.filter(o => ['active', 'awaiting_deposit', 'awaiting_signatures'].includes(o.escrow_status))
  const totalDepositDisplay = lockedOrders.reduce((sum, o) => sum + Number(toDisplayAmount(o.deposit_amount, o.token_mint)), 0)
  const totalDepositUSDT = totalDepositDisplay * solPrice

  // Monthly income = sum of rent_amount_usdt for active orders
  const monthlyIncomeUSDT = orders
    .filter(o => o.escrow_status === 'active')
    .reduce((sum, o) => sum + o.rent_amount_usdt, 0)

  return (
    <div style={{ padding: '0 20px 100px', background: 'transparent' }}>
      {/* Header with greeting + avatar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '48px 0 28px' }}>
        <div>
          <p style={{ color: '#7A7A8A', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{greeting}</p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800,
            letterSpacing: '-0.02em', marginBottom: 6,
            background: 'linear-gradient(135deg, #F0F0F5, #B0B0BA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            @{displayName}
          </h1>
          {user.wallet_address && (
            <button
              onClick={handleCopyWallet}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 8,
                background: walletCopied ? 'rgba(61,214,140,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${walletCopied ? 'rgba(61,214,140,0.25)' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <span style={{
                fontSize: 12, fontFamily: 'monospace', fontWeight: 500,
                color: walletCopied ? '#3DD68C' : '#6A6A7A',
              }}>
                {walletCopied ? 'Copied!' : walletShort}
              </span>
              {!walletCopied && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5A5A6A" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Avatar + Balance */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Link to="/profile" style={{ textDecoration: 'none' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', overflow: 'hidden',
              border: '2px solid rgba(224,120,64,0.3)',
              boxShadow: '0 4px 16px rgba(224,120,64,0.2), inset 0 1px 1px rgba(255,255,255,0.1)',
              cursor: 'pointer', transition: 'transform 0.2s',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <img
                src={`/${owlFile}`}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </Link>
          {walletBalance !== null && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '4px 10px', borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(52,199,89,0.1), rgba(52,199,89,0.04))',
              border: '1px solid rgba(52,199,89,0.2)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#34C759', letterSpacing: '-0.01em' }}>
                {walletBalance.toFixed(4)} SOL
              </span>
              {solPrice > 0 && (
                <span style={{ fontSize: 11, fontWeight: 500, color: '#8A8A9A' }}>
                  ${(walletBalance * solPrice).toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Primary Balance Card */}
      <div style={{
        position: 'relative',
        marginBottom: 24,
        borderRadius: 24,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        padding: 32,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.2)',
      }}>
        {/* Background gradient orbs */}
        <div style={{
          position: 'absolute', top: -80, right: -80, width: 240, height: 240,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,199,89,0.15), transparent)',
          filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60, width: 200, height: 200,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,199,89,0.1), transparent)',
          filter: 'blur(80px)',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* SOL price badge */}
          {solPrice > 0 && (
            <div style={{
              position: 'absolute', top: -8, right: 0,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: '4px 10px',
              fontSize: 11, color: '#8A8A9A', fontWeight: 600,
            }}>
              1 SOL = <span style={{ color: '#34C759' }}>${solPrice.toFixed(2)}</span>
            </div>
          )}

          <p style={{ color: '#8A8A9A', fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Total Value Locked</p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', color: '#F0F0F5' }}>
              ${totalDepositUSDT.toFixed(2)}
            </h2>
          </div>
          <p style={{ color: '#6A6A7A', fontSize: 12, marginBottom: 24 }}>
            {totalDepositDisplay.toFixed(4)} SOL in escrow deposits
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Monthly Income */}
            <div style={{
              background: 'rgba(52,199,89,0.1)',
              borderRadius: 14,
              padding: 16,
              border: '1px solid rgba(52,199,89,0.2)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}>
              <p style={{ color: '#8A8A9A', fontSize: 11, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Period Income</p>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: '#34C759' }}>
                ${monthlyIncomeUSDT.toFixed(2)}
              </p>
            </div>

            {/* Assets Status */}
            <div style={{
              background: 'rgba(255,149,0,0.1)',
              borderRadius: 14,
              padding: 16,
              border: '1px solid rgba(255,149,0,0.2)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}>
              <p style={{ color: '#8A8A9A', fontSize: 11, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Assets Rented</p>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: '#FF9500' }}>
                {assetsRented}/{totalListings}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/listings/create" style={{ flex: 1, textDecoration: 'none' }}>
              <button style={{
                width: '100%', background: 'linear-gradient(135deg, #34C759, #30B050)',
                border: '1px solid rgba(52,199,89,0.4)',
                borderRadius: 12, padding: 12, color: 'white', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(52,199,89,0.25)',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add Asset
              </button>
            </Link>
            <Link to="/listings" style={{ flex: 1, textDecoration: 'none' }}>
              <button style={{
                width: '100%', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12, padding: 12, color: '#F0F0F5', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}>
                Manage Assets
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Transactions Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: '#F0F0F5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Transactions</p>
          <Link to="/chat" style={{ textDecoration: 'none' }}>
            <span style={{ color: '#34C759', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>View All</span>
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#6A6A7A', fontSize: 14 }}>Loading transactions...</div>
        ) : orders.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5" style={{ marginBottom: 12, margin: '0 auto 12px' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <p style={{ color: '#8A8A9A', fontSize: 14, marginBottom: 4 }}>No active transactions</p>
            <p style={{ color: '#6A6A7A', fontSize: 13 }}>Start renting to see transactions here</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.slice(0, 5).map((order) => {
              const colors = ESCROW_STATUS_COLORS[order.escrow_status] || DEFAULT_ESCROW_COLORS

              return (
                <div
                  key={order.id}
                  onClick={() => handleTransactionClick(order)}
                  style={{
                    background: colors.bg,
                    borderRadius: 14,
                    border: `1px solid ${colors.border}`,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.1)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = colors.bg.replace('0.08)', '0.12)')
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = colors.bg
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                  }}
                >
                  {/* Status indicator */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: colors.rentColor,
                    boxShadow: `0 0 12px ${colors.rentColor}`,
                    flexShrink: 0,
                  }} />

                  {/* Transaction info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#F0F0F5' }}>
                      {order.property?.title || 'Transaction'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ color: '#8A8A9A', fontSize: 12 }}>{colors.label}</span>
                      <span style={{ fontSize: 10, color: '#6A6A7A' }}>•</span>
                      <span style={{ color: '#8A8A9A', fontSize: 12 }}>
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Amounts in USDT + SOL subtitle */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'right', flexShrink: 0 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <span style={{ color: '#8A8A9A', fontSize: 11, fontWeight: 500 }}>Rent:</span>
                        <span style={{ color: colors.rentColor, fontWeight: 700, fontSize: 13 }}>
                          ${order.rent_amount_usdt.toFixed(2)}
                        </span>
                      </div>
                      <span style={{ color: '#5A5A6A', fontSize: 10 }}>
                        {toDisplayAmount(order.rent_amount, order.token_mint)} {order.token_mint}
                      </span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <span style={{ color: '#8A8A9A', fontSize: 11, fontWeight: 500 }}>Deposit:</span>
                        <span style={{ color: colors.depositColor, fontWeight: 700, fontSize: 13 }}>
                          ${order.deposit_amount_usdt.toFixed(2)}
                        </span>
                      </div>
                      <span style={{ color: '#5A5A6A', fontSize: 10 }}>
                        {toDisplayAmount(order.deposit_amount, order.token_mint)} {order.token_mint}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
