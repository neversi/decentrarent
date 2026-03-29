import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'

type Status = 'Occupied' | 'Vacant' | 'Leased' | 'Under Maintenance'
type PropertyType = 'Apartment' | 'House' | 'Office' | 'Studio' | 'Loft' | 'Villa'

const STATUSES: Status[] = ['Occupied', 'Vacant', 'Leased', 'Under Maintenance']
const TYPES: PropertyType[] = ['Apartment', 'House', 'Office', 'Studio', 'Loft', 'Villa']

const STATUS_COLORS: Record<Status, string> = {
  'Occupied': '#3DD68C', 'Vacant': '#FF4D6A',
  'Leased': '#E07840', 'Under Maintenance': '#4D9EFF',
}

interface ListingForm {
  title: string; address: string; type: string
  beds: string; baths: string; rent: string
  deposit: string; status: Status; description: string
}

export default function CreateListingPage() {
  const navigate = useNavigate()
  //const { jwt } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState<ListingForm>({
    title: '', address: '', type: '', beds: '', baths: '',
    rent: '', deposit: '', status: 'Vacant', description: '',
  })

  const set = (k: keyof ListingForm, v: string) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      // TODO: replace with real API call
      // await fetch('/api/listings', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      //   body: JSON.stringify(form),
      // })
      await new Promise(r => setTimeout(r, 900))
      setSuccess(true)
      setTimeout(() => navigate('/listings'), 1200)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding:'0 20px 100px' }}>
      <div className="fu" style={{ display:'flex', alignItems:'center', gap:14, padding:'56px 0 28px' }}>
        <button onClick={() => navigate(-1)} style={{ background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:10, cursor:'pointer', display:'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A9AAA" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800 }}>New Listing</h1>
          <p style={{ color:'#6A6A7A', fontSize:13 }}>Fill in the details below</p>
        </div>
      </div>

      {success && (
        <div style={{ background:'rgba(61,214,140,0.1)', border:'1px solid rgba(61,214,140,0.3)', borderRadius:12, padding:'12px 16px', marginBottom:20, color:'#3DD68C', fontSize:14 }}>
          ✓ Listing created successfully!
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
        {/* Name */}
        <div className="fu1" style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>Property name</label>
          <input placeholder="e.g. Downtown Studio" value={form.title} onChange={e => set('title', e.target.value)}
            style={{ background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', color:'#F0F0F5', fontSize:15, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
        </div>

        {/* Address */}
        <div className="fu1" style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>Full address</label>
          <input placeholder="123 Main St, City, State ZIP" value={form.address} onChange={e => set('address', e.target.value)}
            style={{ background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', color:'#F0F0F5', fontSize:15, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
        </div>

        {/* Type */}
        <div className="fu2" style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>Property type</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {TYPES.map(t => (
              <button key={t} onClick={() => set('type', t)} style={{
                background: form.type===t ? '#E07840' : '#1C1C20',
                border: form.type===t ? 'none' : '1px solid rgba(255,255,255,0.07)',
                borderRadius:10, padding:'9px 14px', cursor:'pointer',
                color: form.type===t ? 'white' : '#7A7A8A',
                fontWeight: form.type===t ? 600 : 400, fontSize:13,
                fontFamily:"'DM Sans',sans-serif",
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Beds / Baths */}
        <div className="fu2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {(['beds','baths'] as const).map(k => (
            <div key={k} style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>{k === 'beds' ? 'Bedrooms' : 'Bathrooms'}</label>
              <input type="number" min="0" value={form[k]} onChange={e => set(k, e.target.value)}
                style={{ background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', color:'#F0F0F5', fontSize:15, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
            </div>
          ))}
        </div>

        {/* Rent / Deposit */}
        <div className="fu3" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {(['rent','deposit'] as const).map(k => (
            <div key={k} style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>{k === 'rent' ? 'Monthly rent ($)' : 'Deposit ($)'}</label>
              <input type="number" value={form[k]} onChange={e => set(k, e.target.value)}
                style={{ background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', color:'#F0F0F5', fontSize:15, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="fu3" style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>Status</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {STATUSES.map(s => {
              const c = STATUS_COLORS[s]
              const active = form.status === s
              return (
                <button key={s} onClick={() => set('status', s)} style={{
                  background: active ? `${c}18` : '#1C1C20',
                  border: `1px solid ${active ? c+'50' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius:10, padding:'9px 14px', cursor:'pointer',
                  color: active ? c : '#7A7A8A',
                  fontWeight: active ? 600 : 400, fontSize:13,
                  fontFamily:"'DM Sans',sans-serif",
                }}>{s}</button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div className="fu4" style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:500, color:'#8A8A9A' }}>Description (optional)</label>
          <textarea rows={3} placeholder="Describe the property…" value={form.description} onChange={e => set('description', e.target.value)}
            style={{ background:'#1C1C20', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', color:'#F0F0F5', fontSize:15, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
        </div>

        {/* Save */}
        <div className="fu5">
          <button onClick={handleSave} disabled={saving} style={{
            width:'100%', background:'#E07840', border:'none', borderRadius:14, padding:16,
            color:'white', fontWeight:600, fontSize:16, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            opacity: saving ? 0.7 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          }}>
            {saving
              ? <><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>Saving…</>
              : 'Create Listing'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
