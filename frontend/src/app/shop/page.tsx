import { Suspense } from 'react';
import { Shop } from '@/components/catalog';
import { Loading } from '@/components/customer';
export const metadata = { title: 'Shop the pantry' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Shop />
    </Suspense>
  );
}
