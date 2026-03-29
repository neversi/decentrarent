import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'

interface Listing {
  id: number
  title: string
  city: string
  rent: number
  status: 'occupied' | 'vacant' | 'leased'
  img: string
}

// TODO: replace with GET /api/listings
const MOCK_LISTINGS: Listing[] = [
  { id: 1, title: '1042 Market St.',     city: 'San Francisco, CA', rent: 4200, status: 'occupied', img: '🏢' },
  { id: 2, title: 'Apt 4B, The Beacon', city: 'Seattle, WA',       rent: 2800, status: 'vacant',   img: '🏠' },
  { id: 3, title: 'Riverside Loft',     city: 'Austin, TX',        rent: 3100, status: 'occupied', img: '🏗️' },
  { id: 4, title: 'Pine St. Office',    city: 'Portland, OR',      rent: 5800, status: 'leased',   img: '🏬' },
]

const STATUS_STYLE = {
  occupied: { bg: 'rgba(61,214,140,0.12)',  color: '#3DD68C', label: 'Occupied' },
  vacant:   { bg: 'rgba(255,77,106,0.12)',  color: '#FF4D6A', label: 'Vacant'   },
  leased:   { bg: 'rgba(224,120,64,0.12)', color: '#E07840', label: 'Leased'   },
}

export default function HomePage() {
  const { user, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
// TODO: add setListings and fetch real listings from API
  const [listings] = useState<Listing[]>(MOCK_LISTINGS)

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth')
    // TODO: fetch('/api/listings').then(r => r.json()).then(setListings)
  }, [isAuthenticated, navigate])

  if (!user) return <div style={{ padding: '20px', color: '#ddd' }}>Loading your dashboard…</div>

  const firstName = user.display_name ?? user.wallet_address.slice(0, 8)
  const userBalance = typeof user.balance === 'number' ? user.balance : 0
  const totalIncome = listings.filter(l => l.status !== 'vacant').reduce((s, l) => s + l.rent, 0)

  return (
    <div style={{ padding: '0 20px 100px' }}>
      {/* Header */}
      <div className="fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 0 28px' }}>
        <div>
          <p style={{ color: '#6A6A7A', fontSize: 13, marginBottom: 3 }}>Good morning 👋</p>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {firstName}
          </h1>
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'linear-gradient(135deg, #E07840, #7A3020)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: 'white',
          border: '2px solid rgba(224,120,64,0.3)',
        }}>
          {firstName.slice(0, 2).toUpperCase()}
        </div>
      </div>

      {/* Balance Card */}
      <div className="fu1" style={{
        background: 'linear-gradient(135deg, #1A1208, #1C1410, #141416)',
        borderRadius: 20, padding: 24, marginBottom: 20,
        border: '1px solid rgba(224,120,64,0.2)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: 'rgba(224,120,64,0.15)', filter: 'blur(40px)' }}/>
        <p style={{ color: '#7A6A5A', fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wallet Balance</p>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
          ${userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3DD68C" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span style={{ color: '#3DD68C', fontSize: 13, fontWeight: 500 }}>+4.2% this month</span>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '18px 0' }}/>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: '#6A6A5A', fontSize: 11, marginBottom: 4 }}>Monthly Income</p>
            <p style={{ fontWeight: 700, fontSize: 16 }}>${totalIncome.toLocaleString()}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#6A6A5A', fontSize: 11, marginBottom: 4 }}>Active Listings</p>
            <p style={{ fontWeight: 700, fontSize: 16 }}>{listings.filter(l => l.status !== 'vacant').length}/{listings.length}</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="fu2" style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <Link to="/listings/create" style={{ flex: 1, textDecoration: 'none' }}>
          <div style={{ background: '#E07840', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>Add Listing</span>
          </div>
        </Link>
        <Link to="/chat" style={{ flex: 1, textDecoration: 'none' }}>
          <div style={{ background: '#1C1C20', borderRadius: 14, padding: 14, border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9A9AAA" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>
            <span style={{ color: '#9A9AAA', fontWeight: 600, fontSize: 14 }}>Messages</span>
          </div>
        </Link>
      </div>

      {/* Listings */}
      <div className="fu3">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: '#4A4A5A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Listings</p>
          <Link to="/listings" style={{ color: '#E07840', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See all</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listings.map((l) => {
            const s = STATUS_STYLE[l.status]
            return (
              <Link key={l.id} to={`/listings/${l.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#141416', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{l.img}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</p>
                    <p style={{ color: '#6A6A7A', fontSize: 12 }}>{l.city}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{l.status === 'vacant' ? '—' : `$${l.rent.toLocaleString()}`}</p>
                    <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
