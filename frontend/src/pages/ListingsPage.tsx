import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listProperties } from '../features/properties/api'
import { formatPrice, TOKEN_INFO } from '../features/properties/utils'
import type { Property } from '../features/properties/types'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  listed:   { bg:'rgba(61,214,140,0.12)',  color:'#3DD68C', label:'Occupied' },
  unlisted: { bg:'rgba(255,77,106,0.12)',  color:'#FF4D6A', label:'Vacant'   },
  rented:   { bg:'rgba(224,120,64,0.12)', color:'#E07840', label:'Leased'   },
}

const FALLBACK_STYLE = { bg:'rgba(255,255,255,0.06)', color:'#7A7A8A', label:'Unknown' }

const FILTERS = ['All', 'Listed', 'Unlisted', 'Rented'] as const

export default function ListingsPage() {
  const { token } = useAuthStore()
  const [filter, setFilter] = useState<string>('All')
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listProperties({}, token)
      .then(setProperties)
      .catch(() => setProperties([]))
      .finally(() => setLoading(false))
  }, [token])

  const filtered = filter === 'All'
    ? properties
    : properties.filter(l => l.status === filter.toLowerCase())

  return (
    <div style={{ padding: '0 20px 100px' }}>
      <div className="fu" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'56px 0 20px' }}>
        <div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, letterSpacing:'-0.01em' }}>Listings</h1>
          <p style={{ color:'#7A7A8A', fontSize:13, marginTop:3 }}>{properties.length} properties</p>
        </div>
        <Link to="/listings/create" style={{ textDecoration:'none' }}>
          <div style={{ background:'#E07840', borderRadius:12, padding:'10px 16px', display:'flex', alignItems:'center', gap:6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span style={{ color:'white', fontWeight:600, fontSize:13 }}>Add</span>
          </div>
        </Link>
      </div>

      {/* Filter pills */}
      <div className="fu1" style={{ display:'flex', gap:8, marginBottom:20, overflowX:'auto', paddingBottom:4 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flexShrink:0, background: filter===f ? '#E07840' : '#1C1C20',
            border: filter===f ? 'none' : '1px solid rgba(255,255,255,0.07)',
            borderRadius:24, padding:'8px 16px', cursor:'pointer',
            color: filter===f ? 'white' : '#7A7A8A',
            fontWeight: filter===f ? 600 : 400, fontSize:13,
            fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s',
          }}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#6A6A7A', fontSize:14 }}>Loading listings...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#6A6A7A', fontSize:14 }}>No listings found.</div>
      ) : (
        <div className="fu2" style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(l => {
            const s = STATUS_STYLE[l.status] ?? FALLBACK_STYLE
            const img = l.media?.[0]?.url
            return (
              <Link key={l.id} to={`/listings/${l.id}`} style={{ textDecoration:'none' }}>
                <div style={{ background:'#141416', borderRadius:16, border:'1px solid rgba(255,255,255,0.07)', padding:18, display:'flex', gap:14, alignItems:'center' }}>
                  <div style={{ width:50, height:50, borderRadius:14, background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0, overflow:'hidden' }}>
                    {img
                      ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : '🏠'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                      <p style={{ fontWeight:600, fontSize:14, flex:1, marginRight:8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.title}</p>
                      <span style={{ background:s.bg, color:s.color, padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, flexShrink:0 }}>{s.label}</span>
                    </div>
                    <p style={{ color:'#6A6A7A', fontSize:12, marginBottom:8 }}>{l.location}</p>
                    <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                      <span style={{ fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:4 }}>
                        {l.status==='unlisted'
                          ? <span style={{ color:'#FF4D6A' }}>Vacant</span>
                          : <>
                              <img src={TOKEN_INFO[l.token_mint]?.icon || TOKEN_INFO['SOL'].icon} alt="" style={{ width:14, height:14, borderRadius:'50%' }} />
                              {formatPrice(l.price, l.token_mint)}
                              <span style={{ color:'#7A7A8A', fontSize:12, fontWeight:400 }}>/{l.period_type}</span>
                            </>}
                      </span>
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
