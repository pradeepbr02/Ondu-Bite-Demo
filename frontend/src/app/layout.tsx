import type { Metadata } from 'next';
import { loadCatalog } from '@/lib/catalog';
import { mediaPath } from '@/lib/media';
import { StoreProvider } from '@/components/store-provider';
import { Shell } from '@/components/shell';
import './globals.css';
import './brand.css';
import './pantry.css';
import './catalog.css';
import './identity.css';
import './assistant.css';
import './reviews.css';
import './bag-preview.css';
import './search.css';
export const metadata: Metadata = {
  title: { default: 'Ondu Packet — A little goodness, every day', template: '%s | Ondu Packet' },
  description:
    'Ready-to-eat favourites and Bisibele Bath, Rava Idli and Gulab Jamun mixes, filter coffee and Karnataka snacks. A little taste of home from Ondu Packet.',
  icons: { icon: { url: mediaPath('brand'), type: 'image/webp' } },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initial = await loadCatalog();
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <StoreProvider initial={initial}>
          <Shell whatsappNumber={process.env.WHATSAPP_ORDER_NUMBER}>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
