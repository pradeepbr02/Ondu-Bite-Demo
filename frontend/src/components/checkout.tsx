'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Plus,
  ShoppingBag,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { money, weight, type Address, type Checkout, type Quote } from '@/lib/types';
import { useStore } from './store-provider';
import { AddressForm, AddressText, Guard, Loading, statusLabel } from './customer';

export function CheckoutPage() {
  return (
    <section className="container section purchase-page">
      <h1 className="sr-only">Checkout</h1>
      <div className="breadcrumbs">
        <Link href="/cart">Your bag</Link>
        <span>/</span>
        <span>Checkout</span>
      </div>
      <Guard next="/checkout">
        <CheckoutFlow />
      </Guard>
    </section>
  );
}
function CheckoutFlow() {
  const { cart, refreshCart, notify, reloadCatalog } = useStore();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState('');
  const [coupon, setCoupon] = useState('');
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [active, setActive] = useState<Checkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [a, c] = await Promise.all([
        api<Address[]>('addresses'),
        api<Checkout | null>('checkouts/active'),
      ]);
      setAddresses(a);
      setSelected(a[0]?.id ?? '');
      setActive(c);
      setAdding(!a.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare checkout.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setQuote(null);
    attempt.current = null;
  }, [selected, cart.revision, coupon]);
  useEffect(() => {
    if (!active || !['PREPARING', 'PAYMENT_PENDING'].includes(active.status)) return;
    let refreshing = false;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((new Date(active.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSeconds(left);
      if (left === 0 && !refreshing) {
        refreshing = true;
        void api<Checkout>(`checkouts/${active.checkoutId}`)
          .then((c) => {
            setActive(c);
            return refreshCart();
          })
          .catch(() => {
            refreshing = false;
          });
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active?.checkoutId, active?.expiresAt, active?.status]);
  if (loading) return <Loading text="Getting your checkout ready…" />;
  if (error && !addresses.length && !active)
    return (
      <div className="error-panel" role="alert">
        <p>{error}</p>
        <button className="button secondary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (active) {
    const holding = ['PREPARING', 'PAYMENT_PENDING'].includes(active.status);
    return (
      <div className="checkout-layout">
        <div>
          <div className="panel reservation-card">
            <span className="round-icon">
              <ShoppingBag />
            </span>
            <span className={`status-pill status-${active.status.toLowerCase()}`}>
              {statusLabel(active.status)}
            </span>
            <h2>
              {holding
                ? 'Your little favourites are held.'
                : active.status === 'EXPIRED'
                  ? 'This little hold has ended.'
                  : 'Your checkout is cancelled.'}
            </h2>
            <p>
              {holding
                ? 'We’ve set these packs aside for you. This is a checkout preview: no money has been collected and no delivery is booked.'
                : 'The packs have been released. You can start again with the latest prices and availability.'}
            </p>
            {holding && (
              <div className="reservation-timer">
                <Clock3 size={19} />
                <span>
                  Reserved for{' '}
                  <strong>
                    {Math.floor(seconds / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(seconds % 60).toString().padStart(2, '0')}
                  </strong>
                </span>
              </div>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {holding ? (
              <>
                <button className="button primary full" disabled>
                  <LockKeyhole size={17} /> Payments opening soon
                </button>
                <button
                  className="text-link danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const result = await api<Checkout>(`checkouts/${active.checkoutId}/cancel`, {
                        method: 'POST',
                      });
                      setActive(result);
                      await refreshCart().catch(() => {});
                      void reloadCatalog();
                      notify('Checkout closed. Your stock hold has been released.');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not cancel checkout.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Cancelling checkout…' : 'Cancel checkout'}
                </button>
              </>
            ) : (
              <button
                className="button primary"
                onClick={async () => {
                  setActive(null);
                  setQuote(null);
                  attempt.current = null;
                  await refreshCart().catch(() => {});
                }}
              >
                Start a fresh checkout <ArrowRight size={17} />
              </button>
            )}
            <Link href={`/orders/${active.orderId}`} className="text-link">
              View order details <ArrowRight size={16} />
            </Link>
          </div>
          <div className="panel">
            <h3>
              <MapPin size={18} /> Your delivery address
            </h3>
            <AddressText address={active.order.address} />
          </div>
        </div>
        <Summary totals={active.order.totals} items={active.order.items} />
      </div>
    );
  }
  if (!cart.items.length)
    return (
      <div className="empty-state">
        <ShoppingBag />
        <h2>A little goodness first?</h2>
        <p>Add your favourites to your bag before starting checkout.</p>
        <Link href="/shop" className="button primary">
          Explore the pantry <ArrowRight size={17} />
        </Link>
      </div>
    );
  return (
    <>
      <div className="checkout-preview-note">
        <LockKeyhole size={18} />
        <p>
          <strong>You’re previewing checkout.</strong> Payments and delivery bookings aren’t open
          yet. Creating a checkout holds stock for 15 minutes without charging you.
        </p>
      </div>
      <div className="checkout-layout">
        <div>
          <div className="panel">
            <div className="section-heading">
              <h2>
                <span className="step-number">1</span> A little destination.
              </h2>
              {addresses.length > 0 && (
                <button className="text-link" onClick={() => setAdding(!adding)}>
                  <Plus size={16} /> Add new
                </button>
              )}
            </div>
            <div className="checkout-addresses">
              {addresses.map((a) => (
                <label
                  className={`address-choice ${a.id === selected ? 'selected' : ''}`}
                  key={a.id}
                >
                  <input
                    type="radio"
                    name="delivery-address"
                    value={a.id}
                    checked={selected === a.id}
                    onChange={() => {
                      setSelected(a.id);
                      setError('');
                    }}
                  />
                  <div>
                    <AddressText address={a} />
                  </div>
                  {a.id === selected && <Check size={18} />}
                </label>
              ))}
            </div>
            {adding && (
              <AddressForm
                onCancel={addresses.length ? () => setAdding(false) : undefined}
                onSaved={(a) => {
                  setAddresses((list) => [...list, a]);
                  setSelected(a.id);
                  setAdding(false);
                  notify('Address saved.');
                }}
              />
            )}
          </div>
          <div className="panel checkout-review">
            <h2>
              <span className="step-number">2</span> Review your little favourites.
            </h2>
            <p>We’ll recheck the prices and availability before holding your packs.</p>
            {cart.items.map((i) => (
              <div className="summary-row" key={i.sku}>
                <span>
                  {i.name ?? i.sku} · {i.weightGrams ? weight(i.weightGrams) : ''} × {i.quantity}
                </span>
                <strong>
                  {i.lineTotalPaise === null ? 'Unavailable' : money(i.lineTotalPaise)}
                </strong>
              </div>
            ))}
            <Link className="text-link" href="/cart">
              Edit your bag <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <aside className="panel order-summary">
          <div className="eyebrow">THE GOODNESS, ADDED UP</div>
          <h2>Your checkout</h2>
          <label className="checkout-coupon">
            Coupon code (optional)
            <input
              maxLength={30}
              placeholder="Enter your code"
              value={coupon}
              disabled={busy}
              onChange={(e) => setCoupon(e.target.value.toUpperCase().trim())}
            />
          </label>
          {quote ? (
            <>
              <div className="summary-row">
                <span>Item subtotal</span>
                <span>{money(quote.totals.subtotalPaise)}</span>
              </div>
              <DiscountRow totals={quote.totals} />
              <div className="summary-row">
                <span>Shipping</span>
                <span>
                  {quote.totals.shippingPaise ? money(quote.totals.shippingPaise) : 'On us'}
                </span>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <strong>{money(quote.totals.totalPaise)}</strong>
              </div>
            </>
          ) : (
            <p className="muted">Select an address, then review your current total.</p>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary full"
            disabled={!selected || busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                if (!quote) {
                  setQuote(
                    await api<Quote>('checkouts/quote', {
                      method: 'POST',
                      body: JSON.stringify({
                        cartRevision: cart.revision,
                        addressId: selected,
                        ...(coupon ? { couponCode: coupon } : {}),
                      }),
                    }),
                  );
                } else {
                  const body = JSON.stringify({
                    cartRevision: quote.cartRevision,
                    addressId: selected,
                    ...(quote.totals.couponCode ? { couponCode: quote.totals.couponCode } : {}),
                    quoteFingerprint: quote.quoteFingerprint,
                  });
                  if (!attempt.current || attempt.current.body !== body)
                    attempt.current = { body, key: crypto.randomUUID() };
                  const result = await api<Checkout>('checkouts', {
                    method: 'POST',
                    headers: { 'Idempotency-Key': attempt.current.key },
                    body,
                  });
                  setActive(result);
                  await refreshCart().catch(() => {});
                  void reloadCatalog();
                }
              } catch (e) {
                if (e instanceof ApiError && ['QUOTE_CHANGED', 'CART_CONFLICT'].includes(e.code)) {
                  setQuote(null);
                  attempt.current = null;
                  await refreshCart().catch(() => {});
                }
                if (e instanceof ApiError && e.code === 'ACTIVE_CHECKOUT_EXISTS') {
                  const held = await api<Checkout | null>('checkouts/active').catch(() => null);
                  if (held) setActive(held);
                }
                setError(e instanceof Error ? e.message : 'Could not prepare checkout.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {quote ? 'Checkout' : 'Review my total'} <ArrowRight size={17} />
              </>
            )}
          </button>
          <p className="summary-note">
            {quote
              ? 'Prices are used as listed. Final tax treatment and delivery checks will be ready when sales open.'
              : 'Shipping is ₹59, free from an item subtotal of ₹999.'}
          </p>
          <div className="summary-footer">
            <LockKeyhole size={17} /> No payment will be taken.
          </div>
        </aside>
      </div>
    </>
  );
}
function Summary({
  totals,
  items,
}: {
  totals: Checkout['order']['totals'];
  items: Checkout['order']['items'];
}) {
  return (
    <aside className="panel order-summary">
      <div className="eyebrow">YOUR LITTLE SELECTION</div>
      <h2>The good stuff.</h2>
      {items.map((i) => (
        <div className="summary-row" key={i.sku}>
          <span>
            {i.name} · {weight(i.weightGrams ?? 0)} × {i.quantity}
          </span>
          <strong>{money(i.lineTotalPaise ?? 0)}</strong>
        </div>
      ))}
      <DiscountRow totals={totals} />
      <div className="summary-row">
        <span>Shipping</span>
        <span>{totals.shippingPaise ? money(totals.shippingPaise) : 'On us'}</span>
      </div>
      <div className="summary-total">
        <span>Total</span>
        <strong>{money(totals.totalPaise)}</strong>
      </div>
      <p className="summary-note">Checkout preview · Not paid</p>
    </aside>
  );
}

export function DiscountRow({ totals }: { totals: Checkout['order']['totals'] }) {
  return totals.discountPaise ? (
    <div className="summary-row">
      <span>Discount · {totals.couponCode}</span>
      <span>−{money(totals.discountPaise)}</span>
    </div>
  ) : null;
}
