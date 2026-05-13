import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/Toast';

export function AppLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_16%_-10%,rgba(114,13,215,0.24),transparent_34rem),radial-gradient(circle_at_85%_0%,rgba(119,115,253,0.16),transparent_30rem),#0B0825] flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
