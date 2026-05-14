import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/Toast';

export function AppLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
