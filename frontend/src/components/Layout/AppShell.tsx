import { Outlet } from 'react-router-dom';

interface AppShellProps {
  children?: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
      <main>
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
