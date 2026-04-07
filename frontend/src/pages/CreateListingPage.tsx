import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { createProperty, getUploadUrl, registerMedia } from '../features/properties/api'
import { TOKEN_INFO } from '../features/properties/utils'

type TokenMint = 'SOL' | 'USDC' | 'USDT'

const TOKENS: { value: TokenMint; label: string; decimals: number; icon: string }[] =
  (Object.entries(TOKEN_INFO) as [TokenMint, typeof TOKEN_INFO[string]][]).map(([value, info]) => ({
    value, label: info.label, decimals: info.decimals, icon: info.icon,
  }))

interface ImagePreview {
  file: File
  preview: string
}

type PeriodType = 'minute' | 'hour' | 'day' | 'month'

const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: 'minute', label: 'Minute' },
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
]

interface ListingForm {
  title: string
  location: string
  description: string
  price: string
  security_deposit: string
  token_mint: TokenMint
  period_type: PeriodType
}

export default function CreateListingPage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<ImagePreview[]>([])
  const [uploadProgress, setUploadProgress] = useState('')
  const [form, setForm] = useState<ListingForm>({
    title: '', location: '', description: '',
    price: '', security_deposit: '', token_mint: 'SOL', period_type: 'month',
  })

  const set = <K extends keyof ListingForm>(k: K, v: ListingForm[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const selectedToken = TOKENS.find(t => t.value === form.token_mint)!

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setImages(prev => [...prev, ...newImages])
    e.target.value = ''
  }

  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const uploadImages = async (propertyId: string, jwt: string) => {
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      setUploadProgress(`Uploading image ${i + 1}/${images.length}...`)

      // 1. Get presigned URL
      const { upload_url, file_key } = await getUploadUrl(propertyId, img.file.name, jwt)

      // 2. Upload directly to MinIO
      await fetch(upload_url, {
        method: 'PUT',
        body: img.file,
        headers: { 'Content-Type': img.file.type },
      })

      // 3. Register in backend
      await registerMedia(propertyId, file_key, jwt)
    }
    setUploadProgress('')
  }

  const handleSave = async () => {
    if (!token) {
      setError('You must be logged in to create a listing.')
      return
    }
    if (!form.title || !form.location || !form.price || !form.security_deposit) {
      setError('Title, location, monthly rent, and security deposit are required.')
      return
    }

    const priceFloat = parseFloat(form.price)
    if (isNaN(priceFloat) || priceFloat <= 0) {
      setError('Monthly rent must be a positive number.')
      return
    }
    const depositFloat = parseFloat(form.security_deposit)
    if (isNaN(depositFloat) || depositFloat < 0) {
      setError('Security deposit must be a positive number.')
      return
    }
    const priceSmallest = Math.round(priceFloat * Math.pow(10, selectedToken.decimals))
    const depositSmallest = Math.round(depositFloat * Math.pow(10, selectedToken.decimals))

    setSaving(true)
    setError(null)
    try {
      const property = await createProperty({
        title: form.title,
        description: form.description,
        location: form.location,
        price: priceSmallest,
        deposit_price: depositSmallest,
        token_mint: form.token_mint,
        period_type: form.period_type,
      }, token)

      // Upload images if any
      if (images.length > 0) {
        await uploadImages(property.id, token)
      }

      setSuccess(true)
      setTimeout(() => navigate('/listings'), 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create listing.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, padding: '14px 16px', color: '#F0F0F5', fontSize: 15,
    outline: 'none', fontFamily: "'DM Sans',sans-serif", width: '100%', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: '#8A8A9A',
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    background: active ? '#E07840' : '#1C1C20',
    border: active ? 'none' : '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '9px 14px', cursor: 'pointer',
    color: active ? 'white' : '#7A7A8A',
    fontWeight: active ? 600 : 400, fontSize: 13,
    fontFamily: "'DM Sans',sans-serif",
  })

  return (
    <div style={{ padding: '0 20px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '56px 0 28px' }}>
        <button onClick={() => navigate(-1)} style={{ background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A9AAA" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>New Listing</h1>
          <p style={{ color: '#6A6A7A', fontSize: 13 }}>Fill in the details below</p>
        </div>
      </div>

      {success && (
        <div style={{ background: 'rgba(61,214,140,0.1)', border: '1px solid rgba(61,214,140,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#3DD68C', fontSize: 14 }}>
          Listing created successfully!
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#FF4D6A', fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Images */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Property photos</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddImages}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => handleRemoveImage(i)}
                  style={{
                    position: 'absolute', top: 4, right: 4, width: 20, height: 20,
                    borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none',
                    color: 'white', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  x
                </button>
                {i === 0 && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'rgba(224,120,64,0.9)', padding: '2px 0',
                    fontSize: 9, fontWeight: 600, textAlign: 'center', color: 'white',
                  }}>
                    COVER
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 80, height: 80, borderRadius: 12,
                background: '#1C1C20', border: '2px dashed rgba(255,255,255,0.1)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4, color: '#5A5A6A',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span style={{ fontSize: 10 }}>Add</span>
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Property name</label>
          <input placeholder="e.g. Downtown Studio" value={form.title} onChange={e => set('title', e.target.value)} style={inputStyle} />
        </div>

        {/* Location */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Location</label>
          <input placeholder="123 Main St, City, State" value={form.location} onChange={e => set('location', e.target.value)} style={inputStyle} />
        </div>

        {/* Token */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Payment token</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TOKENS.map(t => (
              <button key={t.value} onClick={() => set('token_mint', t.value)} style={{ ...pillStyle(form.token_mint === t.value), display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src={t.icon} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rental Period */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Rental period</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {PERIOD_TYPES.map(p => (
              <button key={p.value} onClick={() => set('period_type', p.value)} style={{ ...pillStyle(form.period_type === p.value), flex: 1 }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price + Security Deposit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Rent per {form.period_type} ({form.token_mint})</label>
            <input
              type="number" step="any" min="0"
              placeholder={form.token_mint === 'SOL' ? '0.5' : '50.00'}
              value={form.price}
              onChange={e => set('price', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Security deposit ({form.token_mint})</label>
            <input
              type="number" step="any" min="0"
              placeholder={form.token_mint === 'SOL' ? '1.0' : '100.00'}
              value={form.security_deposit}
              onChange={e => set('security_deposit', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Description (optional)</label>
          <textarea
            rows={3}
            placeholder="Describe the property..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        {/* Price preview */}
        {form.price && (
          <div style={{ background: '#1C1C20', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ fontSize: 12, color: '#6A6A7A', marginBottom: 4 }}>Listing preview</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src={TOKEN_INFO[form.token_mint]?.icon} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                {parseFloat(form.price) || 0} {form.token_mint}
                <span style={{ color: '#6A6A7A', fontWeight: 400, fontSize: 13 }}>/ {form.period_type}</span>
              </p>
              {form.security_deposit && (
                <p style={{ fontSize: 14, color: '#8A8A9A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
                  Security deposit: {parseFloat(form.security_deposit) || 0} {form.token_mint}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Save */}
        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', background: '#E07840', border: 'none', borderRadius: 14, padding: 16,
          color: 'white', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
          opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          {saving
            ? <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />{uploadProgress || 'Saving...'}</>
            : 'Create Listing'}
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
