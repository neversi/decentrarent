import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { getProperty, updateProperty, deleteProperty, updatePropertyStatus, getUploadUrl, registerMedia, deleteMedia } from '../features/properties/api'
import { formatPrice, TOKEN_INFO } from '../features/properties/utils'
import { apiFetch } from '../lib/api'
import type { Property } from '../features/properties/types'
import type { Conversation } from '../features/chat/types'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  listed:   { bg: 'rgba(61,214,140,0.12)',  color: '#3DD68C', label: 'Occupied' },
  unlisted: { bg: 'rgba(255,77,106,0.12)',  color: '#FF4D6A', label: 'Vacant'   },
  rented:   { bg: 'rgba(224,120,64,0.12)', color: '#E07840', label: 'Leased'   },
}

const FALLBACK_STYLE = { bg: 'rgba(255,255,255,0.06)', color: '#7A7A8A', label: 'Unknown' }

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token, user } = useAuthStore()

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', description: '', location: '', price: '' })
  const [saving, setSaving] = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Status toggle
  const [togglingStatus, setTogglingStatus] = useState(false)

  // Media upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingMedia, setDeletingMedia] = useState<string | null>(null)

  // Contact landlord
  const [contacting, setContacting] = useState(false)

  const isOwner = user && property && user.id === property.owner_wallet

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getProperty(id, token)
      .then((p) => {
        setProperty(p)
        setEditForm({ title: p.title, description: p.description, location: p.location, price: String(p.price) })
      })
      .catch(() => setError('Property not found.'))
      .finally(() => setLoading(false))
  }, [id, token])

  const handleSaveEdit = async () => {
    if (!id || !token || !property) return
    setSaving(true)
    try {
      const updated = await updateProperty(id, {
        title: editForm.title,
        description: editForm.description,
        location: editForm.location,
        price: parseInt(editForm.price) || 0,
      }, token)
      setProperty(updated)
      setEditing(false)
    } catch {
      setError('Failed to update property.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !token) return
    setDeleting(true)
    try {
      await deleteProperty(id, token)
      navigate('/listings')
    } catch {
      setError('Failed to delete property.')
      setDeleting(false)
    }
  }

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !id || !token) return
    e.target.value = ''
    setUploading(true)
    try {
      for (const file of files) {
        const { upload_url, file_key } = await getUploadUrl(id, file.name, token)
        await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        await registerMedia(id, file_key, token)
      }
      const updated = await getProperty(id, token)
      setProperty(updated)
    } catch {
      setError('Failed to upload image.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteMedia = async (mediaId: string) => {
    if (!id || !token) return
    setDeletingMedia(mediaId)
    try {
      await deleteMedia(id, mediaId, token)
      const updated = await getProperty(id, token)
      setProperty(updated)
    } catch {
      setError('Failed to delete image.')
    } finally {
      setDeletingMedia(null)
    }
  }

  const handleToggleStatus = async () => {
    if (!id || !token || !property) return
    const newStatus = property.status === 'listed' ? 'unlisted' : 'listed'
    setTogglingStatus(true)
    try {
      const updated = await updatePropertyStatus(id, newStatus, token)
      setProperty(updated)
    } catch {
      setError('Failed to update status.')
    } finally {
      setTogglingStatus(false)
    }
  }

  const handleContactLandlord = async () => {
    if (!property || !token) return
    setContacting(true)
    setError(null)
    try {
      const conv = await apiFetch<Conversation>('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          property_id: property.id,
          landlord_id: property.owner_wallet,
        }),
      }, token)
      navigate('/chat', { state: { conversation: conv } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation.')
    } finally {
      setContacting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '0 20px 100px' }}>
        <div style={{ padding: '56px 0 20px' }}>
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6A6A7A', fontSize: 14 }}>Loading property...</div>
        </div>
      </div>
    )
  }

  if (error && !property) {
    return (
      <div style={{ padding: '0 20px 100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '56px 0 28px' }}>
          <button onClick={() => navigate(-1)} style={{ background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A9AAA" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>Property</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#FF4D6A', fontSize: 14 }}>{error}</div>
      </div>
    )
  }

  if (!property) return null

  const s = STATUS_STYLE[property.status] ?? FALLBACK_STYLE
  const hasImages = property.media && property.media.length > 0

  const inputStyle: React.CSSProperties = {
    background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12,
    padding: '12px 16px', color: '#F0F0F5', fontSize: 15, outline: 'none',
    fontFamily: "'DM Sans',sans-serif", width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '0 20px 100px' }}>
      {/* Back button + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '56px 0 28px' }}>
        <button onClick={() => navigate(-1)} style={{ background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A9AAA" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>Property Details</h1>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#FF4D6A', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Media */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUploadImages} style={{ display: 'none' }} />

      {hasImages ? (
        <div style={{ marginBottom: 20 }}>
          {/* Main image */}
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
            <img src={property.media[0].url} alt={property.title} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
            {isOwner && (
              <button onClick={() => handleDeleteMedia(property.media[0].id)} disabled={deletingMedia === property.media[0].id}
                style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {deletingMedia === property.media[0].id ? '...' : 'x'}
              </button>
            )}
          </div>
          {/* Thumbnails */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {property.media.slice(1).map((m) => (
              <div key={m.id} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {isOwner && (
                  <button onClick={() => handleDeleteMedia(m.id)} disabled={deletingMedia === m.id}
                    style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    x
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                style={{ width: 72, height: 72, borderRadius: 10, background: '#1C1C20', border: '2px dashed rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: '#5A5A6A' }}>
                {uploading
                  ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg><span style={{ fontSize: 9 }}>Add</span></>}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 20, position: 'relative' }}>
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: '#1C1C20', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
          </div>
          {isOwner && (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ marginTop: 10, width: '100%', background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px', color: '#9A9AAA', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {uploading
                ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Uploading...</>
                : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Add Photos</>}
            </button>
          )}
        </div>
      )}

      {/* Property info card */}
      <div style={{ background: '#141416', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: 20, marginBottom: 16 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#8A8A9A', marginBottom: 6, display: 'block' }}>Title</label>
              <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#8A8A9A', marginBottom: 6, display: 'block' }}>Location</label>
              <input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#8A8A9A', marginBottom: 6, display: 'block' }}>Price</label>
              <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#8A8A9A', marginBottom: 6, display: 'block' }}>Description</label>
              <textarea rows={3} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSaveEdit} disabled={saving} style={{
                flex: 1, background: '#E07840', border: 'none', borderRadius: 12, padding: '12px 16px',
                color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => { setEditing(false); setEditForm({ title: property.title, description: property.description, location: property.location, price: String(property.price) }) }} style={{
                flex: 1, background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px',
                color: '#9A9AAA', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, flex: 1, marginRight: 12 }}>{property.title}</h2>
              <span style={{ background: s.bg, color: s.color, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{s.label}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, color: '#7A7A8A', fontSize: 13 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A7A8A" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {property.location}
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 16px' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <p style={{ color: '#6A6A5A', fontSize: 11, marginBottom: 4 }}>Price</p>
                <p style={{ fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <img src={TOKEN_INFO[property.token_mint]?.icon || TOKEN_INFO['SOL'].icon} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                  {formatPrice(property.price, property.token_mint)} {property.token_mint}
                  <span style={{ color: '#7A7A8A', fontSize: 12, fontWeight: 400 }}>/ {property.period_type}</span>
                </p>
              </div>
              <div>
                <p style={{ color: '#6A6A5A', fontSize: 11, marginBottom: 4 }}>Payment</p>
                <p style={{ fontWeight: 600, fontSize: 14, color: '#E07840', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <img src={TOKEN_INFO[property.token_mint]?.icon || TOKEN_INFO['SOL'].icon} alt="" style={{ width: 16, height: 16, borderRadius: '50%' }} />
                  {property.token_mint}
                </p>
              </div>
            </div>

            {property.description && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 16px' }} />
                <div>
                  <p style={{ color: '#6A6A5A', fontSize: 11, marginBottom: 8 }}>Description</p>
                  <p style={{ color: '#B0B0BA', fontSize: 14, lineHeight: 1.6 }}>{property.description}</p>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Contact Landlord — non-owner view */}
      {!isOwner && !editing && (
        <button onClick={handleContactLandlord} disabled={contacting} style={{
          width: '100%', background: '#E07840', border: 'none', borderRadius: 14, padding: 16,
          color: 'white', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          opacity: contacting ? 0.7 : 1, marginBottom: 16,
        }}>
          {contacting ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Starting conversation...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>
              Contact Landlord
            </>
          )}
        </button>
      )}

      {/* Owner actions */}
      {isOwner && !editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Edit button */}
          <button onClick={() => setEditing(true)} style={{
            width: '100%', background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14,
            color: '#F0F0F5', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A9AAA" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Property
          </button>

          {/* Status toggle */}
          <button onClick={handleToggleStatus} disabled={togglingStatus} style={{
            width: '100%', background: property.status === 'listed' ? 'rgba(255,77,106,0.1)' : 'rgba(61,214,140,0.1)',
            border: `1px solid ${property.status === 'listed' ? 'rgba(255,77,106,0.3)' : 'rgba(61,214,140,0.3)'}`,
            borderRadius: 14, padding: 14,
            color: property.status === 'listed' ? '#FF4D6A' : '#3DD68C',
            fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            opacity: togglingStatus ? 0.7 : 1,
          }}>
            {togglingStatus ? 'Updating...' : property.status === 'listed' ? 'Unlist Property' : 'List Property'}
          </button>

          {/* Delete */}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{
              width: '100%', background: 'rgba(255,77,106,0.06)', border: '1px solid rgba(255,77,106,0.15)', borderRadius: 14, padding: 14,
              color: '#FF4D6A', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            }}>
              Delete Property
            </button>
          ) : (
            <div style={{ background: '#141416', borderRadius: 14, border: '1px solid rgba(255,77,106,0.3)', padding: 16 }}>
              <p style={{ color: '#FF4D6A', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>Are you sure you want to delete this property?</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleDelete} disabled={deleting} style={{
                  flex: 1, background: '#FF4D6A', border: 'none', borderRadius: 12, padding: '12px 16px',
                  color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  opacity: deleting ? 0.7 : 1,
                }}>
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  flex: 1, background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px',
                  color: '#9A9AAA', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meta info */}
      <div style={{ marginTop: 20, padding: '14px 16px', background: '#141416', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
        <p style={{ color: '#5A5A6A', fontSize: 11 }}>
          Created {new Date(property.created_at).toLocaleDateString()} · Updated {new Date(property.updated_at).toLocaleDateString()}
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
