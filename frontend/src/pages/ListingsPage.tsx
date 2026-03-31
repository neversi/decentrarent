import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listProperties } from '../features/properties/api'
import { formatPrice, TOKEN_INFO } from '../features/properties/utils'
import type { Property } from '../features/properties/types'

export default function ListingsPage() {
  const { token, user } = useAuthStore()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listProperties({}, token)
      .then(setProperties)
      .catch(() => setProperties([]))
      .finally(() => setLoading(false))
  }, [token])

  // Show only listed properties that don't belong to the current user
  const available = properties.filter(
    (p) => p.status === 'listed' && p.owner_wallet !== user?.id
  )

  return (
    <div style={{ padding: '0 20px 100px' }}>
      <div style={{ padding: '56px 0 20px' }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>Explore</h1>
        <p style={{ color: '#7A7A8A', fontSize: 13, marginTop: 3 }}>{available.length} available {available.length === 1 ? 'property' : 'properties'}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6A6A7A', fontSize: 14 }}>Loading properties...</div>
      ) : available.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5" style={{ marginBottom: 16 }}>
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
          </svg>
          <p style={{ color: '#6A6A7A', fontSize: 14 }}>No properties available right now.</p>
          <p style={{ color: '#4A4A5A', fontSize: 13, marginTop: 6 }}>Check back later for new listings.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {available.map((p) => {
            const img = p.media?.[0]?.url
            return (
              <Link key={p.id} to={`/listings/${p.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: '#141416', borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.07)',
                  overflow: 'hidden',
                }}>
                  {/* Property image */}
                  <div style={{ width: '100%', height: 160, background: '#1C1C20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {img
                      ? <img src={img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>}
                  </div>

                  {/* Property info */}
                  <div style={{ padding: '14px 18px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <p style={{ fontWeight: 700, fontSize: 16, color: '#F0F0F5', flex: 1, marginRight: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, color: '#7A7A8A', fontSize: 13 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7A7A8A" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {p.location}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 6, color: '#F0F0F5' }}>
                        <img src={TOKEN_INFO[p.token_mint]?.icon || TOKEN_INFO['SOL'].icon} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                        {formatPrice(p.price, p.token_mint)}
                        <span style={{ color: '#7A7A8A', fontSize: 12, fontWeight: 400 }}>/{p.period_type}</span>
                      </span>
                      <span style={{ color: '#E07840', fontSize: 13, fontWeight: 600 }}>View details</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
