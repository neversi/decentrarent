import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listProperties } from '../features/properties/api'
import { apiFetch } from '../lib/api'
import type { Property } from '../features/properties/types'
import type { Conversation } from '../features/chat/types'

interface Order {
  id: string
  conversation_id: string
  property_id: string
  escrow_status: string
  rent_amount: number
  deposit_amount: number
  token_mint: string
  rent_start_date: string
  rent_end_date: string
  created_at: string
  property?: Property
}

// Escrow status colors - iOS 16 liquid glass
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
  const [listings, setListings] = useState<Property[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

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
        .catch(() => []),
    ])
      .then(([props, ordersData]) => {
        setListings(props)
        setOrders(Array.isArray(ordersData) ? ordersData : [])
      })
      .finally(() => setLoading(false))
  }, [isAuthenticated, navigate, user, token])

  const handleTransactionClick = async (order: Order) => {
    try {
      // Fetch the conversation details
      const conversation = await apiFetch<Conversation>(`/conversations/${order.conversation_id}`, {}, token)
      // Navigate to chat with conversation data
      navigate('/chat', { state: { conversation } })
    } catch (err) {
      console.error('Failed to load conversation:', err)
      // Fallback: just navigate to chat, it will load the conversation
      navigate('/chat')
    }
  }

  if (!user) return <div style={{ padding: '20px', color: '#ddd' }}>Loading your dashboard...</div>

  const firstName = user.display_name ?? user.wallet_address.slice(0, 8)
  const totalListings = listings.length
  const assetsRented = listings.filter(l => l.status === 'rented').length
  const totalMonthlyIncome = orders
    .filter(o => o.escrow_status === 'active')
    .reduce((sum, o) => sum + o.rent_amount, 0)
  const totalEscrow = orders
    .filter(o => ['active', 'settled', 'awaiting_deposit', 'awaiting_signatures'].includes(o.escrow_status))
    .reduce((sum, o) => sum + (o.deposit_amount + o.rent_amount), 0)

  return (
    <div style={{ padding: '0 20px 100px', background: 'transparent' }}>
      {/* Header with greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 0 32px' }}>
        <div>
          <p style={{ color: '#8A8A9A', fontSize: 13, marginBottom: 3, fontWeight: 500 }}>Good morning</p>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #F0F0F5, #B0B0BA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {firstName}
          </h1>
        </div>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(52,199,89,0.2), rgba(52,199,89,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#34C759',
          border: '1.5px solid rgba(52,199,89,0.3)',
          boxShadow: '0 8px 32px rgba(52,199,89,0.15), inset 0 1px 1px rgba(255,255,255,0.2)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}>
          {firstName.slice(0, 2).toUpperCase()}
        </div>
      </div>

      {/* Primary Balance Card - iOS 16 Liquid Glass */}
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
          <p style={{ color: '#8A8A9A', fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Total Value Locked</p>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', color: '#F0F0F5' }}>
              {(totalEscrow / 1000000).toFixed(2)}
            </h2>
            <span style={{ fontSize: 18, color: '#8A8A9A', fontWeight: 600 }}>SOL</span>
          </div>

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
              <p style={{ color: '#8A8A9A', fontSize: 11, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Monthly Income</p>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: '#34C759' }}>
                {(totalMonthlyIncome / 1000000).toFixed(3)} <span style={{ fontSize: 12, fontWeight: 500 }}>SOL</span>
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
          <Link to="/listings" style={{ textDecoration: 'none' }}>
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

                  {/* Amounts */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <span style={{ color: '#8A8A9A', fontSize: 11, fontWeight: 500 }}>Rent:</span>
                      <span style={{ color: colors.rentColor, fontWeight: 700, fontSize: 13 }}>
                        {(order.rent_amount / 1000000).toFixed(3)} SOL
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <span style={{ color: '#8A8A9A', fontSize: 11, fontWeight: 500 }}>Deposit:</span>
                      <span style={{ color: colors.depositColor, fontWeight: 700, fontSize: 13 }}>
                        {(order.deposit_amount / 1000000).toFixed(3)} SOL
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
