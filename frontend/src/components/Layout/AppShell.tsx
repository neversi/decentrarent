import { Outlet, Link, useLocation } from 'react-router-dom';
import { ConnectWallet } from '../../features/auth/components/ConnectWallet';
import { useAuthStore } from '../../features/auth/store';

export function AppShell() {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold text-white hover:text-gray-200">
            DecentraRent
          </Link>
          {isAuthenticated && (
            <nav className="flex gap-4">
              <Link
                to="/chat"
                className={`text-sm transition-colors ${
                  location.pathname === '/chat'
                    ? 'text-purple-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Chat
              </Link>
            </nav>
          )}
        </div>
        <ConnectWallet />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
