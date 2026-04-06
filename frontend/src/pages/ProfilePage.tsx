import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState } from 'react'
import { listProperties } from '../features/properties/api'
import { apiFetch } from '../lib/api'
import type { User } from '../features/auth/types'

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  sublabel?: string
  danger?: boolean
  badge?: boolean
  chevron?: boolean
  onClick?: () => void
}

function MenuItem({ icon, label, sublabel, danger, badge, chevron = true, onClick }: MenuItemProps) {
  return (
    <button onClick={onClick} style={{
      width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
      background:'none', border:'none', cursor:'pointer', textAlign:'left',
      transition: 'all 0.2s ease',
    }}>
      <div style={{
        width:36, height:36, borderRadius:12, flexShrink:0,
        background: danger ? 'rgba(255,77,106,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${danger ? 'rgba(255,77,106,0.15)' : 'rgba(255,255,255,0.06)'}`,
        display:'flex', alignItems:'center', justifyContent:'center',
        transition: 'all 0.2s ease',
      }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontWeight:500, fontSize:13, color: danger ? '#FF4D6A' : '#FFFFFF', letterSpacing:'-0.3px' }}>{label}</p>
          {badge && (
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: '#FF4D6A',
              boxShadow: '0 0 6px rgba(255,77,106,0.5)',
            }} />
          )}
        </div>
        {sublabel && <p style={{ color:'#888890', fontSize:11, marginTop:3 }}>{sublabel}</p>}
      </div>
      {chevron && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>}
    </button>
  )
}

const Divider = () => <div style={{ height:'1px', background:'rgba(255,255,255,0.04)', margin:'0' }}/>

export default function ProfilePage() {
  const { user, logout, token, login } = useAuthStore()
  const { disconnect } = useWallet()
  const navigate = useNavigate()

  const [listings, setListings] = useState<any[]>([])
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    display_name: '', first_name: '', last_name: '', email: '', phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    if (!user) return
    listProperties({ owner: user.id }, token)
      .then(setListings)
      .catch(() => setListings([]))
  }, [user, token])

  useEffect(() => {
    if (user) {
      setEditForm({
        display_name: user.display_name || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
      })
    }
  }, [user])

  const handleLogout = () => {
    disconnect()
    logout()
    navigate('/auth')
  }

  const handleSaveProfile = async () => {
    if (!token) return
    setSaving(true)
    setEditError('')
    try {
      const updated = await apiFetch<User>('/user/me', {
        method: 'PUT',
        body: JSON.stringify(editForm),
      }, token)
      login(token, { ...updated, balance: user?.balance || 0 })
      setShowEdit(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const short = user.wallet_address
    ? user.wallet_address.slice(0, 4) + '\u2026' + user.wallet_address.slice(-4)
    : 'Wallet'

  const totalListings = listings.length
  const occupiedCount = listings.filter(l => l.status === 'available').length
  const occupancy = totalListings > 0 ? Math.round((occupiedCount / totalListings) * 100) : 0

  const profileIncomplete = !user.first_name || !user.last_name || !user.email
  const filledCount = [user.display_name, user.first_name, user.last_name, user.email, user.phone].filter(Boolean).length
  const completionPct = Math.round((filledCount / 5) * 100)

  // Owl avatar
  const owlIndex = (user.id.charCodeAt(0) + user.id.charCodeAt(1)) % 20 + 1
  const owlFile = owlIndex === 10
    ? `Owl - All versions-${String(owlIndex).padStart(2, '0')}.jpg`
    : `Owl - All versions-${String(owlIndex).padStart(2, '0')}.png`

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', paddingBottom:120 }}>
      {/* Hero Background Gradient */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:400,
        background:'radial-gradient(ellipse 800px 400px at 50% 0%, rgba(224,120,64,0.15), transparent)',
        pointerEvents:'none',
      }}/>

      <div style={{ position:'relative', zIndex:1 }}>
        {/* Profile Header */}
        <div style={{ padding:'40px 20px 24px', textAlign:'center' }}>
          {/* Owl Avatar */}
          <div style={{ position:'relative', display:'inline-block', marginBottom:20 }}>
            <div style={{
              width:100, height:100, borderRadius:'24px', margin:'0 auto',
              overflow: 'hidden',
              boxShadow:'0 20px 60px rgba(224,120,64,0.25)',
              border:'2px solid rgba(224,120,64,0.3)',
            }}>
              <img src={`/${owlFile}`} alt="Avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            </div>
            {/* Completion badge */}
            <div style={{
              position:'absolute', bottom:-4, right:-4,
              width:32, height:32, borderRadius:'50%',
              background: profileIncomplete ? '#FF4D6A' : '#34C759',
              border:'3px solid #0a0a0f',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow: `0 4px 12px ${profileIncomplete ? 'rgba(255,77,106,0.3)' : 'rgba(52,199,89,0.3)'}`,
            }}>
              {profileIncomplete ? (
                <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>!</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
          </div>

          {/* Name & Wallet */}
          <h1 style={{
            fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, marginBottom:6,
            background:'linear-gradient(135deg, #FFFFFF 0%, #E0E0E0 100%)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
          }}>
            {user.display_name || user.username || short}
          </h1>
          {user.username && (
            <p style={{ color:'#E07840', fontSize:14, fontWeight:600, marginBottom:4 }}>@{user.username}</p>
          )}
          <p style={{ color:'#888890', fontSize:13, fontFamily:'monospace', fontWeight:500, letterSpacing:'0.5px' }}>
            {short}
          </p>

          {/* Completion bar */}
          {profileIncomplete && (
            <div style={{
              display:'inline-flex', alignItems:'center', gap:8, marginTop:16,
              background:'rgba(255,77,106,0.06)', border:'1px solid rgba(255,77,106,0.15)',
              borderRadius:12, padding:'8px 14px', cursor: 'pointer',
            }} onClick={() => setShowEdit(true)}>
              <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${completionPct}%`, height: '100%', background: '#E07840', borderRadius: 2 }} />
              </div>
              <span style={{ color: '#FF4D6A', fontSize: 11, fontWeight: 600 }}>
                Profile {completionPct}% complete
              </span>
              <span style={{ color: '#E07840', fontSize: 11 }}>{'\u2192'}</span>
            </div>
          )}

          {!profileIncomplete && (
            <div style={{
              display:'inline-flex', alignItems:'center', gap:6, marginTop:16,
              background:'rgba(52,214,140,0.08)', border:'1px solid rgba(52,214,140,0.2)',
              borderRadius:20, padding:'6px 14px', backdropFilter:'blur(10px)',
            }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#34C759', boxShadow:'0 0 8px rgba(52,214,140,0.6)' }}/>
              <span style={{ color:'#34C759', fontSize:12, fontWeight:600 }}>Profile Complete</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div style={{ padding:'0 16px 32px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
            border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'20px 16px', textAlign:'center',
            backdropFilter:'blur(20px)', position:'relative', overflow:'hidden',
          }}>
            <div style={{ position:'absolute', top:'-50%', right:'-50%', width:200, height:200, background:'radial-gradient(circle, rgba(224,120,64,0.1), transparent)', borderRadius:'50%', pointerEvents:'none' }}/>
            <p style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:4, position:'relative', zIndex:1 }}>{totalListings}</p>
            <p style={{ color:'#888890', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.5px', position:'relative', zIndex:1 }}>Properties</p>
          </div>
          <div style={{
            background:'linear-gradient(135deg, rgba(52,214,140,0.08) 0%, rgba(52,214,140,0.02) 100%)',
            border:'1px solid rgba(52,214,140,0.15)', borderRadius:20, padding:'20px 16px', textAlign:'center',
            backdropFilter:'blur(20px)', position:'relative', overflow:'hidden',
          }}>
            <div style={{ position:'absolute', top:'-50%', right:'-50%', width:200, height:200, background:'radial-gradient(circle, rgba(52,214,140,0.1), transparent)', borderRadius:'50%', pointerEvents:'none' }}/>
            <p style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:4, color:'#34C759', position:'relative', zIndex:1 }}>{occupancy}%</p>
            <p style={{ color:'#888890', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.5px', position:'relative', zIndex:1 }}>Occupancy</p>
          </div>
        </div>

        <div style={{ height:'1px', background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)', margin:'0 0 24px' }}/>

        {/* Account Section */}
        <div style={{ padding:'0 16px 24px' }}>
          <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, color:'#555560', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12, paddingLeft:4 }}>Account Settings</p>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
            border:'1px solid rgba(255,255,255,0.06)', borderRadius:18, overflow:'hidden', backdropFilter:'blur(20px)',
          }}>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{color:'#E07840'}}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
              label="Personal Info" sublabel={profileIncomplete ? 'Complete your profile' : 'Name, email, phone'}
              badge={profileIncomplete}
              onClick={() => setShowEdit(true)}
            />
            <Divider/>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{color:'#7A3020'}}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>}
              label="Payment Methods" sublabel="Wallets & accounts"
            />
            <Divider/>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{color:'#FF9500'}}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>}
              label="Notifications" sublabel="Alerts & preferences"
            />
          </div>
        </div>

        {/* Security Section */}
        <div style={{ padding:'0 16px 24px' }}>
          <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, color:'#555560', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12, paddingLeft:4 }}>Security & Privacy</p>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
            border:'1px solid rgba(255,255,255,0.06)', borderRadius:18, overflow:'hidden', backdropFilter:'blur(20px)',
          }}>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{color:'#34C759'}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
              label="Security" sublabel="Wallet, 2FA, sessions"
            />
            <Divider/>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{color:'#8E7D4E'}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              label="Tax Documents" sublabel="1099s, invoices"
            />
          </div>
        </div>

        {/* Logout */}
        <div style={{ padding:'0 16px' }}>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,77,106,0.05) 0%, rgba(255,77,106,0.02) 100%)',
            border:'1px solid rgba(255,77,106,0.1)', borderRadius:18, overflow:'hidden', backdropFilter:'blur(20px)',
          }}>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
              label="Log out" danger chevron={false} onClick={handleLogout}
            />
          </div>
        </div>

        <p style={{ textAlign:'center', color:'#3A3A4A', fontSize:11, marginTop:32, fontWeight:500 }}>DecentraRent v1.0.0</p>
      </div>

      {/* Edit Profile Bottom Sheet */}
      {showEdit && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', zIndex: 2000,
          }}
          onClick={() => setShowEdit(false)}
        >
          <div
            style={{
              width: '100%', background: '#0d0d14', borderRadius: '24px 24px 0 0',
              padding: '28px 20px 36px', maxHeight: '85vh', overflowY: 'auto',
              animation: 'sheetUp 0.3s ease',
              border: '1px solid rgba(255,255,255,0.06)', borderBottom: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginBottom: 20 }}>
              Edit Profile
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FieldInput label="Display Name" value={editForm.display_name}
                onChange={(v) => setEditForm(f => ({ ...f, display_name: v }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FieldInput label="First Name" value={editForm.first_name} required={!editForm.first_name}
                  onChange={(v) => setEditForm(f => ({ ...f, first_name: v }))} />
                <FieldInput label="Last Name" value={editForm.last_name} required={!editForm.last_name}
                  onChange={(v) => setEditForm(f => ({ ...f, last_name: v }))} />
              </div>
              <FieldInput label="Email" value={editForm.email} required={!editForm.email} type="email"
                onChange={(v) => setEditForm(f => ({ ...f, email: v }))} />
              <FieldInput label="Phone" value={editForm.phone} type="tel"
                onChange={(v) => setEditForm(f => ({ ...f, phone: v }))} />

              {editError && <p style={{ color: '#FF4D6A', fontSize: 13 }}>{editError}</p>}

              <button onClick={handleSaveProfile} disabled={saving} style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #E07840, #FF9500)',
                color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
                opacity: saving ? 0.7 : 1,
                boxShadow: '0 8px 24px rgba(224,120,64,0.25)',
                marginTop: 4,
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function FieldInput({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label style={{
        fontSize: 12, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4,
        color: required ? '#FF4D6A' : '#8A8A9A',
      }}>
        {label}
        {required && <span style={{ fontSize: 10 }}>(required)</span>}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.06)',
          border: `1px solid ${required ? 'rgba(255,77,106,0.25)' : 'rgba(255,255,255,0.1)'}`,
          color: '#e2e8f0', fontSize: 14, outline: 'none',
          fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
