import Link from 'next/link';
import Image from 'next/image';
import { mediaPath } from '@/lib/media';
import { ArrowUpRight, Flower2 } from 'lucide-react';
export function About() {
  return (
    <section className="container section info-page">
      <div className="eyebrow">OUR LITTLE STORY</div>
      <h1>
        Good food.
        <br />
        <em>Everyday happy.</em>
      </h1>
      <p className="intro">Meet Ondu Packet—your everyday pantry, packed with little joys.</p>
      <div className="info-card brand-story-card">
        <div>
          <h2>A pantry for the little moments.</h2>
          <p>
            A handful between meetings. Something crunchy with your filter coffee. A sweet bite
            passed across the table. We’re creating a space for the food that makes the everyday
            feel a little more lovely.
          </p>
          <p>
            Explore four categories, choose a pack that suits you, and find your own little
            favourites.
          </p>
          <Link href="/shop" className="button primary">
            Meet the pantry <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="brand-reference">
          <Image
            src={mediaPath('brand')}
            alt="Ondu Packet logo in green, golden yellow and white"
            fill
            sizes="(max-width: 760px) 90vw, 280px"
          />
        </div>
      </div>
      <p className="info-disclosure">
        Our store is currently a preview. Product photography is illustrative, and verified product
        information will be added before sales open. Payments and delivery bookings are not yet
        available.
      </p>
    </section>
  );
}
export function FAQ() {
  const items = [
    [
      'What pack sizes are available?',
      'Our pantry has 250 g, 500 g and 1 kg variants. Each size has its own stock, so one pack size may be available while another is sold out.',
    ],
    [
      'How much is shipping?',
      'Shipping is ₹59. It’s free when your item subtotal reaches ₹999. You can review the amount before reserving your packs.',
    ],
    [
      'Can I make a payment or book delivery?',
      'Not yet. This store is a preview while we prepare payments, product information and delivery checks. You can browse, save a bag, and try the reservation-based checkout without being charged.',
    ],
    [
      'Does adding to my bag hold stock?',
      'Adding to your bag does not hold stock. Creating a checkout reserves your selected packs for 15 minutes. If you cancel or the hold expires, they become available again.',
    ],
    [
      'Where can I find my order?',
      'Sign in and visit Your orders. Select an order to view its status, saved items, totals and address. Preview orders have not been paid for or dispatched.',
    ],
    [
      'Can I update a delivery address?',
      'Yes. You can add, edit and remove addresses from your account. An existing checkout keeps its original address. Cancel that checkout and start a new one if you need to change it.',
    ],
    [
      'Where can I check ingredients and allergens?',
      'Open a product page and expand Ingredients & allergens. Our demo catalog does not yet have verified ingredient information. We’ll add it before sales open; please don’t use illustrative images to infer ingredients or allergen safety.',
    ],
  ];
  return (
    <section className="container section info-page">
      <div className="eyebrow">A LITTLE HELP, RIGHT HERE</div>
      <h1>
        Good questions.
        <br />
        <em>Simple answers.</em>
      </h1>
      <p className="intro">A few things to know about your happy little pantry.</p>
      <div className="faq-list">
        {items.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <Link href="/orders" className="button primary">
        Find your orders <ArrowUpRight size={18} />
      </Link>
    </section>
  );
}
