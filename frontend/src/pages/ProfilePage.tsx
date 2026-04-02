import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState } from 'react'
import { listProperties } from '../features/properties/api'

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  sublabel?: string
  danger?: boolean
  chevron?: boolean
  onClick?: () => void
}

function MenuItem({ icon, label, sublabel, danger, chevron = true, onClick }: MenuItemProps) {
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
        <p style={{ fontWeight:500, fontSize:13, color: danger ? '#FF4D6A' : '#FFFFFF', letterSpacing:'-0.3px' }}>{label}</p>
        {sublabel && <p style={{ color:'#888890', fontSize:11, marginTop:3 }}>{sublabel}</p>}
      </div>
      {chevron && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>}
    </button>
  )
}

const Divider = () => <div style={{ height:'1px', background:'rgba(255,255,255,0.04)', margin:'0' }}/>

export default function ProfilePage() {
  const { user, logout, token } = useAuthStore()
  const { disconnect } = useWallet()
  const navigate = useNavigate()

  const [listings, setListings] = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    listProperties({ owner: user.id }, token)
      .then(setListings)
      .catch(() => setListings([]))
  }, [user, token])

  const handleLogout = () => {
    disconnect()
    logout()
    navigate('/auth')
  }

  if (!user) return null

  const short = user.wallet_address
    ? user.wallet_address.slice(0, 4) + '…' + user.wallet_address.slice(-4)
    : 'Wallet'

  // Dynamic stats
  const totalListings = listings.length
  const occupiedCount = listings.filter(l => l.status === 'available').length
  const occupancy = totalListings > 0 ? Math.round((occupiedCount / totalListings) * 100) : 0

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
          {/* Avatar with Badge */}
          <div style={{ position:'relative', display:'inline-block', marginBottom:20 }}>
            <div style={{
              width:100, height:100, borderRadius:'24px', margin:'0 auto',
              background:'linear-gradient(135deg, #E07840 0%, #FF9500 50%, #7A3020 100%)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:38, color:'white',
              boxShadow:'0 20px 60px rgba(224,120,64,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
              border:'1px solid rgba(255,255,255,0.1)',
              backdropFilter:'blur(10px)',
            }}>
              {short.slice(0,2).toUpperCase()}
            </div>
            {/* Verified Badge */}
            <div style={{
              position:'absolute', bottom:-4, right:-4,
              width:32, height:32, borderRadius:'50%',
              background:'#34C759', border:'3px solid #0a0a0f',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 4px 12px rgba(52,199,89,0.3)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>

          {/* Name & Wallet */}
          <h1 style={{
            fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, marginBottom:6,
            background:'linear-gradient(135deg, #FFFFFF 0%, #E0E0E0 100%)',
            WebkitBackgroundClip:'text',
            WebkitTextFillColor:'transparent',
            backgroundClip:'text',
          }}>
            {user.display_name ?? short}
          </h1>
          <p style={{ color:'#888890', fontSize:13, fontFamily:'monospace', fontWeight:500, letterSpacing:'0.5px' }}>
            {short}
          </p>

          {/* Status Badge */}
          <div style={{
            display:'inline-flex', alignItems:'center', gap:6, marginTop:16,
            background:'rgba(52,214,140,0.08)', border:'1px solid rgba(52,214,140,0.2)',
            borderRadius:20, padding:'6px 14px', backdropFilter:'blur(10px)',
          }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#34C759', boxShadow:'0 0 8px rgba(52,214,140,0.6)' }}/>
            <span style={{ color:'#34C759', fontSize:12, fontWeight:600 }}>Active Landlord</span>
          </div>
        </div>

        {/* Stats Grid - Premium Style */}
        <div style={{ padding:'0 16px 32px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
            border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:20, padding:'20px 16px', textAlign:'center',
            backdropFilter:'blur(20px)',
            position:'relative', overflow:'hidden',
          }}>
            <div style={{
              position:'absolute', top:'-50%', right:'-50%', width:200, height:200,
              background:'radial-gradient(circle, rgba(224,120,64,0.1), transparent)',
              borderRadius:'50%', pointerEvents:'none',
            }}/>
            <p style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:4, position:'relative', zIndex:1 }}>{totalListings}</p>
            <p style={{ color:'#888890', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.5px', position:'relative', zIndex:1 }}>Properties</p>
          </div>

          <div style={{
            background:'linear-gradient(135deg, rgba(52,214,140,0.08) 0%, rgba(52,214,140,0.02) 100%)',
            border:'1px solid rgba(52,214,140,0.15)',
            borderRadius:20, padding:'20px 16px', textAlign:'center',
            backdropFilter:'blur(20px)',
            position:'relative', overflow:'hidden',
          }}>
            <div style={{
              position:'absolute', top:'-50%', right:'-50%', width:200, height:200,
              background:'radial-gradient(circle, rgba(52,214,140,0.1), transparent)',
              borderRadius:'50%', pointerEvents:'none',
            }}/>
            <p style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:4, color:'#34C759', position:'relative', zIndex:1 }}>{occupancy}%</p>
            <p style={{ color:'#888890', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.5px', position:'relative', zIndex:1 }}>Occupancy</p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height:'1px', background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)', margin:'0 0 24px' }}/>

        {/* Account Section */}
        <div style={{ padding:'0 16px 24px' }}>
          <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, color:'#555560', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12, paddingLeft:4 }}>Account Settings</p>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
            border:'1px solid rgba(255,255,255,0.06)', borderRadius:18, overflow:'hidden',
            backdropFilter:'blur(20px)',
          }}>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{color:'#E07840'}}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
              label="Personal Info" sublabel="Name, avatar, bio"
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
            border:'1px solid rgba(255,255,255,0.06)', borderRadius:18, overflow:'hidden',
            backdropFilter:'blur(20px)',
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

        {/* Logout Section */}
        <div style={{ padding:'0 16px' }}>
          <div style={{
            background:'linear-gradient(135deg, rgba(255,77,106,0.05) 0%, rgba(255,77,106,0.02) 100%)',
            border:'1px solid rgba(255,77,106,0.1)', borderRadius:18, overflow:'hidden',
            backdropFilter:'blur(20px)',
          }}>
            <MenuItem
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
              label="Log out" danger chevron={false} onClick={handleLogout}
            />
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign:'center', color:'#3A3A4A', fontSize:11, marginTop:32, fontWeight:500 }}>PropVault v1.0.0</p>
      </div>
    </div>
  )
}
