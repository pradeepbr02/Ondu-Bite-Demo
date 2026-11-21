import { CartPage } from '@/components/customer';
export const metadata = { title: 'Your bag' };
export default function Page() {
  return <CartPage whatsappNumber={process.env.WHATSAPP_ORDER_NUMBER} />;
}
