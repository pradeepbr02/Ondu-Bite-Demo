import type { Metadata } from 'next';
import { AdminPortal } from '@/components/admin/portal';
import './admin.css';
export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminPortal />;
}
