import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { AppShell } from './components/Layout/AppShell'
import { useAuthStore } from './features/auth/store'

// Existing (friend)
import { ChatWindow } from './features/chat/components/ChatWindow'

// Auth
import { ConnectWallet } from './features/auth/components/ConnectWallet'

// Your pages
import HomePage from './pages/HomePage'
import ListingsPage from './pages/ListingsPage'
import CreateListingPage from './pages/CreateListingPage'
import PropertyDetailPage from './pages/PropertyDetailPage'
import ProfilePage from './pages/ProfilePage'

// UI
import BottomNav from './components/Layout/BottomNav'
import { ToastProvider } from './features/toast/components/ToastProvider'

/* ─────────────────────────────────────────── */

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />
}

/* ─────────────────────────────────────────── */

function HomeRedirect() {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />
}

/* ─────────────────────────────────────────── */

const HIDE_NAV = ['/auth']

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const hideNav = HIDE_NAV.includes(location.pathname)

  return (
    <div className="app">
      {children}
      {!hideNav && <BottomNav />}
    </div>
  )
}

/* ─────────────────────────────────────────── */

function AppRoutes() {
  return (
    <Routes>
      {/* Entry */}
      <Route path="/" element={<HomeRedirect />} />

      {/* Public */}
      <Route
        path="/auth"
        element={
          <Layout>
            <ConnectWallet />
          </Layout>
        }
      />

      {/* Protected */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Layout>
              <HomePage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/listings"
        element={
          <ProtectedRoute>
            <Layout>
              <ListingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/listings/create"
        element={
          <ProtectedRoute>
            <Layout>
              <CreateListingPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/listings/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <PropertyDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Layout>
              <ChatWindow />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/* ─────────────────────────────────────────── */

export default function App() {
  // const { token, verifyToken } = useAuthStore()

  // useEffect(() => {
  //   if (token) {
  //     verifyToken()
  //   }
  // }, [token, verifyToken])

  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <ToastProvider />
            <AppShell>
              <AppRoutes />
            </AppShell>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}