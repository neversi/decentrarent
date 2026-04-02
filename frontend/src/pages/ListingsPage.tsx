import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listProperties } from '../features/properties/api'
import { formatPrice, TOKEN_INFO } from '../features/properties/utils'
import type { Property } from '../features/properties/types'

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', color: '#3DD68C', bg: 'rgba(61,214,140,0.12)', border: 'rgba(61,214,140,0.3)' },
  { value: 'rented', label: 'Rented', color: '#E07840', bg: 'rgba(224,120,64,0.12)', border: 'rgba(224,120,64,0.3)' },
  { value: 'archive', label: 'Archived', color: '#7A7A8A', bg: 'rgba(122,122,138,0.12)', border: 'rgba(122,122,138,0.3)' },
]

/** Map legacy DB statuses to current ones */
function normalizeStatus(p: Property): Property {
  if (p.status === 'listed') return { ...p, status: 'available' }
  if (p.status === 'unlisted') return { ...p, status: 'archive' }
  return p
}

export default function ListingsPage() {
  const { token, user } = useAuthStore()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showMyListings, setShowMyListings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000])
  const [statusFilter, setStatusFilter] = useState<string[]>(['available', 'rented', 'archive'])

  useEffect(() => {
    setLoading(true)
    if (showMyListings && user?.id) {
      fetch(`/api/properties?owner=${user.id}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => setProperties((Array.isArray(data) ? data : []).map(normalizeStatus)))
        .catch(() => setProperties([]))
        .finally(() => setLoading(false))
    } else {
      listProperties({}, token)
        .then(data => data.map(normalizeStatus))
        .then(setProperties)
        .catch(() => setProperties([]))
        .finally(() => setLoading(false))
    }
  }, [token, showMyListings, user?.id])

  // Apply all filters
  const filtered = properties.filter(p => {
    // Status filter
    if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false

    // Price filter — use correct decimals per token
    const info = TOKEN_INFO[p.token_mint] || TOKEN_INFO['SOL']
    const priceHuman = p.price / Math.pow(10, info.decimals)
    if (priceHuman < priceRange[0] || priceHuman > priceRange[1]) return false

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      return p.title.toLowerCase().includes(query) || p.location.toLowerCase().includes(query)
    }

    return true
  })

  return (
    <div style={{ padding: '0 16px 100px', background: '#0a0a0f', minHeight: '100vh' }}>
      {/* Hero Background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
        background: 'radial-gradient(ellipse 800px 400px at 50% 0%, rgba(52,199,89,0.1), transparent)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ padding: '40px 0 32px', position: 'relative', zIndex: 1 }}>
        <h1 style={{
          fontFamily: "'Syne',sans-serif",
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: 24,
          background: 'linear-gradient(135deg, #F0F0F5 0%, #B0B0BA 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Explore Listings</h1>

        {/* Controls Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          {/* Premium Apple-like Switcher */}
          <div style={{
            display: 'inline-flex',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
            borderRadius: 14,
            padding: 5,
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            gap: 0,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.15)',
          }}>
          <button
            onClick={() => setShowMyListings(false)}
            style={{
              padding: '9px 18px',
              background: !showMyListings
                ? 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))'
                : 'transparent',
              border: !showMyListings ? '1px solid rgba(255,255,255,0.25)' : 'none',
              borderRadius: 11,
              color: !showMyListings ? '#F0F0F5' : '#7A7A8A',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '-0.2px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: !showMyListings ? '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.3)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!showMyListings) {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.12))'
              }
            }}
            onMouseLeave={(e) => {
              if (!showMyListings) {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))'
              }
            }}
          >
            All Listings
          </button>
          <button
            onClick={() => setShowMyListings(true)}
            style={{
              padding: '9px 18px',
              background: showMyListings
                ? 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))'
                : 'transparent',
              border: showMyListings ? '1px solid rgba(255,255,255,0.25)' : 'none',
              borderRadius: 11,
              color: showMyListings ? '#F0F0F5' : '#7A7A8A',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '-0.2px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: showMyListings ? '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.3)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (showMyListings) {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.12))'
              }
            }}
            onMouseLeave={(e) => {
              if (showMyListings) {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))'
              }
            }}
          >
            My Listings
          </button>
          </div>

          {/* Filter and Search Icons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowSearch(true)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s ease',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'
              }}
              title="Search"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A8A9A" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </button>
            <button
              onClick={() => setShowFilter(true)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s ease',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'
              }}
              title="Filter"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A8A9A" strokeWidth="2.2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            </button>
          </div>
        </div>

        <p style={{ color: '#888890', fontSize: 13, fontWeight: 500 }}>{filtered.length} {showMyListings ? 'my ' : ''}{filtered.length === 1 ? 'property' : 'properties'}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6A6A7A', fontSize: 14 }}>Loading properties...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5" style={{ marginBottom: 16 }}>
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
          </svg>
          <p style={{ color: '#6A6A7A', fontSize: 14 }}>No properties available right now.</p>
          <p style={{ color: '#4A4A5A', fontSize: 13, marginTop: 6 }}>Check back later for new listings.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((p) => {
            const img = p.media?.[0]?.url
            const statusColors: Record<string, { bg: string; border: string; text: string }> = {
              available: { bg: 'rgba(61,214,140,0.15)', border: 'rgba(61,214,140,0.3)', text: '#3DD68C' },
              rented: { bg: 'rgba(224,120,64,0.15)', border: 'rgba(224,120,64,0.3)', text: '#E07840' },
              archive: { bg: 'rgba(122,122,138,0.15)', border: 'rgba(122,122,138,0.3)', text: '#7A7A8A' },
            }
            const statusStyle = statusColors[p.status] || statusColors.available

            return (
              <Link key={p.id} to={`/listings/${p.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    transform: 'translateY(0)',
                    backdropFilter: 'blur(10px)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-8px)'
                    ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                    ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.1)'
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    {/* Property image */}
                    <div style={{ width: '100%', height: 200, background: '#1C1C20', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                      {img
                        ? <img src={img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>}

                      {/* Status badge */}
                      <div style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        background: statusStyle.bg,
                        border: `1px solid ${statusStyle.border}`,
                        borderRadius: 24,
                        padding: '6px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: statusStyle.text,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                      }}>
                        {p.status === 'available' ? 'Available' : p.status === 'rented' ? 'Rented' : 'Archive'}
                      </div>
                    </div>

                    {/* Property info */}
                    <div style={{ padding: '18px 18px 20px' }}>
                      <p style={{ fontWeight: 700, fontSize: 18, color: '#F0F0F5', marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</p>

                      {/* Location */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }} onClick={(e) => {
                        e.preventDefault()
                        window.open(`https://www.google.com/maps/search/${encodeURIComponent(p.location)}`, '_blank')
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E07840" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span style={{ fontSize: 13, color: '#E07840', fontWeight: 500, textDecoration: 'underline' }}>{p.location}</span>
                      </div>

                      {/* Pricing info */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div
                          style={{
                            background: 'linear-gradient(135deg, rgba(52,199,89,0.12) 0%, rgba(52,199,89,0.04) 100%)',
                            borderRadius: 14,
                            padding: 14,
                            border: '1px solid rgba(52,199,89,0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            transition: 'all 0.3s ease',
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                            position: 'relative',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(52,199,89,0.18) 0%, rgba(52,199,89,0.08) 100%)'
                            ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(52,199,89,0.4)'
                            ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 20px rgba(52,199,89,0.2), inset 0 1px 1px rgba(255,255,255,0.1)'
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(52,199,89,0.12) 0%, rgba(52,199,89,0.04) 100%)'
                            ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(52,199,89,0.25)'
                            ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                          }}
                        >
                          <div>
                            <p style={{ fontSize: 10, color: '#34C759', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.7px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2c6.627 0 12 5.373 12 12s-5.373 12-12 12S0 20.627 0 14 5.373 2 12 2z"/><path d="M10 9l3 6 3-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Monthly Rent
                            </p>
                          </div>
                          <p style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, color: '#34C759', letterSpacing: '-0.3px' }}>
                            <img src={TOKEN_INFO[p.token_mint]?.icon || TOKEN_INFO['SOL'].icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                            {formatPrice(p.price, p.token_mint)}
                          </p>
                        </div>
                        <div
                          style={{
                            background: 'linear-gradient(135deg, rgba(255,149,0,0.12) 0%, rgba(255,149,0,0.04) 100%)',
                            borderRadius: 14,
                            padding: 14,
                            border: '1px solid rgba(255,149,0,0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            transition: 'all 0.3s ease',
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                            position: 'relative',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(255,149,0,0.18) 0%, rgba(255,149,0,0.08) 100%)'
                            ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,149,0,0.4)'
                            ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 20px rgba(255,149,0,0.2), inset 0 1px 1px rgba(255,255,255,0.1)'
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(255,149,0,0.12) 0%, rgba(255,149,0,0.04) 100%)'
                            ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,149,0,0.25)'
                            ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                          }}
                        >
                          <div>
                            <p style={{ fontSize: 10, color: '#FF9500', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.7px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                              Amount Lock
                            </p>
                          </div>
                          <p style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, color: '#FF9500', letterSpacing: '-0.3px' }}>
                            <img src={TOKEN_INFO[p.token_mint]?.icon || TOKEN_INFO['SOL'].icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                            {formatPrice(p.price, p.token_mint)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Search Modal */}
      {showSearch && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', zIndex: 1000,
        }} onClick={() => setShowSearch(false)}>
          <div style={{
            width: '100%', background: '#0d0d14', borderRadius: '24px 24px 0 0',
            padding: '24px 20px 32px', animation: 'slideUp 0.3s ease',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18 }}>Search Listings</h2>
              <button onClick={() => setShowSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8A8A9A' }}>{'\u00D7'}</button>
            </div>

            <input
              type="text"
              placeholder="Search by name, city, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#F0F0F5', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
                boxSizing: 'border-box', marginBottom: 16,
              }}
            />

            <p style={{ fontSize: 12, color: '#8A8A9A', marginBottom: 8 }}>Searching in: title, location, and address</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSearch(false)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 10,
                background: '#34C759', border: 'none', color: 'white', fontWeight: 600,
                cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
              }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilter && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', zIndex: 1000,
        }} onClick={() => setShowFilter(false)}>
          <div style={{
            width: '100%', background: '#0d0d14', borderRadius: '24px 24px 0 0',
            padding: '24px 20px 32px', maxHeight: '80vh', overflow: 'auto',
            animation: 'slideUp 0.3s ease',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18 }}>Filters</h2>
              <button onClick={() => setShowFilter(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8A8A9A' }}>{'\u00D7'}</button>
            </div>

            {/* Price Range Filter */}
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 14, color: '#e2e8f0' }}>Price Range (SOL)</p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <input
                  type="number"
                  value={priceRange[0]}
                  onChange={(e) => setPriceRange([Math.max(0, parseInt(e.target.value) || 0), priceRange[1]])}
                  placeholder="Min"
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#F0F0F5', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                  }}
                />
                <span style={{ color: '#8A8A9A' }}>{'\u2014'}</span>
                <input
                  type="number"
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], Math.max(priceRange[0], parseInt(e.target.value) || 10000)])}
                  placeholder="Max"
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#F0F0F5', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                  }}
                />
              </div>
              <input
                type="range"
                min="0"
                max="10000"
                value={priceRange[1]}
                onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: 12, color: '#8A8A9A', marginTop: 8 }}>{priceRange[0]} - {priceRange[1]} SOL</p>
            </div>

            {/* Status Filter — toggle buttons */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 14, color: '#e2e8f0' }}>Listing Status</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {STATUS_OPTIONS.map(opt => {
                  const active = statusFilter.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        if (active) {
                          setStatusFilter(statusFilter.filter(s => s !== opt.value))
                        } else {
                          setStatusFilter([...statusFilter, opt.value])
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 10,
                        background: active ? opt.bg : 'rgba(255,255,255,0.04)',
                        border: `1.5px solid ${active ? opt.border : 'rgba(255,255,255,0.08)'}`,
                        color: active ? opt.color : '#5A5A6A',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: "'DM Sans',sans-serif",
                        boxShadow: active ? `0 0 12px ${opt.bg}` : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setStatusFilter(['available', 'rented', 'archive']); setPriceRange([0, 10000]); }} style={{
                flex: 1, padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#8A8A9A', fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
              }}>Reset</button>
              <button onClick={() => setShowFilter(false)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 10,
                background: '#34C759', border: 'none', color: 'white', fontWeight: 600,
                cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
              }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
