import { NavLink, useLocation } from 'react-router-dom'
import { useChatStore } from '../../features/chat/store'

const tabs = [
  {
    to: '/home',
    label: 'Home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'white' : 'none'} stroke={active ? 'white' : '#3A3A4A'} strokeWidth="1.8">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
    ),
  },
  {
    to: '/listings',
    label: 'Listings',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'white' : '#3A3A4A'} strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    to: '/chat',
    label: 'Chat',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'white' : '#3A3A4A'} strokeWidth="1.8">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'white' : '#3A3A4A'} strokeWidth="1.8">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const isWideScreen = typeof window !== 'undefined' && window.innerWidth > 768
  const unreadCounts = useChatStore((s) => s.unreadCounts)
  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0)

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: isWideScreen ? 'none' : 430,
        background: 'rgba(12,12,14,0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: isWideScreen ? 'center' : 'space-around',
        alignItems: 'center',
        padding: isWideScreen ? '14px 0' : '10px 0 24px',
        zIndex: 100,
      }}
    >
      {tabs.map((t) => {
        const active = pathname.startsWith(t.to)
        const isWideScreen = typeof window !== 'undefined' && window.innerWidth > 768
        return (
          <NavLink key={t.to} to={t.to} style={{ textDecoration: 'none' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: isWideScreen ? 'row' : 'column',
                alignItems: 'center',
                gap: isWideScreen ? 8 : 4,
                padding: isWideScreen ? '8px 20px' : '4px 14px',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ position: 'relative' }}>
                {t.icon(active)}
                {t.to === '/chat' && totalUnread > 0 && (
                  <div style={{
                    position: 'absolute', top: -4, right: -8,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: '#FF4D6A', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', border: '2px solid rgba(12,12,14,0.94)',
                    boxShadow: '0 2px 6px rgba(255,77,106,0.4)',
                  }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: isWideScreen ? 13 : 10,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#fff' : '#3A3A4A',
                  fontFamily: "'DM Sans', sans-serif",
                  display: isWideScreen ? 'block' : 'block',
                }}
              >
                {t.label}
              </span>
            </div>
          </NavLink>
        )
      })}
    </nav>
  )
}
