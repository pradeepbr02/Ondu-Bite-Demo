'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Flower2,
  LoaderCircle,
  LogOut,
  MapPin,
  Minus,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { money, weight, type Address, type Order } from '@/lib/types';
import { whatsappOrderUrl } from '@/lib/whatsapp';
import { useStore } from './store-provider';
import { FoodVisual } from './catalog';

export function Loading({ text = 'Getting everything ready…' }: { text?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" />
      <p>{text}</p>
    </div>
  );
}
export function Guard({ children, next = '/account' }: { children: ReactNode; next?: string }) {
  const { ready, customer } = useStore();
  if (!ready) return <Loading />;
  if (!customer)
    return (
      <div className="empty-state">
        <UserRound />
        <h1>A little hello first.</h1>
        <p>Sign in to keep your bag, addresses and orders together.</p>
        <Link className="button primary" href={`/account?next=${encodeURIComponent(next)}`}>
          Sign in or create an account <ArrowRight size={17} />
        </Link>
      </div>
    );
  return children;
}

export function Account() {
  const { customer, ready, login, logout, notify } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  if (!ready) return <Loading />;
  if (customer)
    return (
      <section className="container section account-page">
        <div className="page-title">
          <div className="eyebrow">YOUR LITTLE CORNER</div>
          <h1>Hello, {customer.name.split(' ')[0]}.</h1>
          <p>Your pantry favourites, all in one place.</p>
        </div>
        <div className="account-layout">
          <aside className="panel account-sidebar">
            <UserRound />
            <h3>{customer.name}</h3>
            <p>{customer.email}</p>
            {customer.role === 'admin' && (
              <Link href="/admin">
                <Package size={18} /> Store administration <ArrowUpRight size={16} />
              </Link>
            )}
            <Link href="/orders">
              <Package size={18} /> Your orders <ArrowUpRight size={16} />
            </Link>
            <Link href="/cart">
              <ShoppingBag size={18} /> Your bag <ArrowUpRight size={16} />
            </Link>
            <div className="account-signout-actions">
              <button
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await logout();
                  } catch (e) {
                    notify(e instanceof Error ? e.message : 'Could not sign out.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <LogOut size={16} /> Sign out
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await logout(true);
                  } catch (e) {
                    notify(e instanceof Error ? e.message : 'Could not sign out.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <LogOut size={16} /> Sign out all devices
              </button>
            </div>
          </aside>
          <AddressBook />
        </div>
      </section>
    );
  return (
    <section className="container auth-page">
      <div className="auth-story">
        <div className="eyebrow">GOOD TO HAVE YOU HERE</div>
        <h1>
          Your next
          <br />
          <em>little favourite</em>
          <br />
          is waiting.
        </h1>
        <p>Save your pantry picks, keep track of your orders, and make yourself at home.</p>
        <Flower2 />
        <span>GOOD FOOD. GOOD MOOD.</span>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'selected' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Sign in
          </button>
          <button
            className={mode === 'register' ? 'selected' : ''}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Create account
          </button>
        </div>
        <h2>{mode === 'login' ? 'Welcome back.' : 'Hello, new friend.'}</h2>
        <p>
          {mode === 'login'
            ? 'A little goodness is just a sign-in away.'
            : 'Let’s make some room in your pantry.'}
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="form-success" role="status">
            {success}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setSuccess('');
            const data = new FormData(e.currentTarget);
            const email = String(data.get('email'));
            const password = String(data.get('password'));
            try {
              if (mode === 'register') {
                await api('auth/register', {
                  method: 'POST',
                  body: JSON.stringify({ name: data.get('name'), email, password }),
                });
                setMode('login');
                setSuccess('Your account is ready. Sign in to make yourself at home.');
              } else {
                await login(email, password);
                const next = new URLSearchParams(window.location.search).get('next');
                if (next && ['/checkout', '/cart', '/orders', '/admin'].includes(next))
                  router.push(next);
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === 'register' && (
            <label>
              Your name
              <input
                name="name"
                className="input"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="What should we call you?"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                name="password"
                type={show ? 'text' : 'password'}
                className="input"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'register' ? 12 : 1}
                maxLength={128}
                placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <button className="button primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {mode === 'register' ? 'Make yourself at home' : 'Sign in'} <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        <p className="auth-note">Your bag is saved to your account when you sign in.</p>
      </div>
    </section>
  );
}

const states = [
  ['AN', 'Andaman & Nicobar'],
  ['AP', 'Andhra Pradesh'],
  ['AR', 'Arunachal Pradesh'],
  ['AS', 'Assam'],
  ['BR', 'Bihar'],
  ['CH', 'Chandigarh'],
  ['CG', 'Chhattisgarh'],
  ['DN', 'Dadra & Nagar Haveli and Daman & Diu'],
  ['DL', 'Delhi'],
  ['GA', 'Goa'],
  ['GJ', 'Gujarat'],
  ['HR', 'Haryana'],
  ['HP', 'Himachal Pradesh'],
  ['JK', 'Jammu & Kashmir'],
  ['JH', 'Jharkhand'],
  ['KA', 'Karnataka'],
  ['KL', 'Kerala'],
  ['LA', 'Ladakh'],
  ['LD', 'Lakshadweep'],
  ['MP', 'Madhya Pradesh'],
  ['MH', 'Maharashtra'],
  ['MN', 'Manipur'],
  ['ML', 'Meghalaya'],
  ['MZ', 'Mizoram'],
  ['NL', 'Nagaland'],
  ['OD', 'Odisha'],
  ['PY', 'Puducherry'],
  ['PB', 'Punjab'],
  ['RJ', 'Rajasthan'],
  ['SK', 'Sikkim'],
  ['TN', 'Tamil Nadu'],
  ['TS', 'Telangana'],
  ['TR', 'Tripura'],
  ['UP', 'Uttar Pradesh'],
  ['UK', 'Uttarakhand'],
  ['WB', 'West Bengal'],
];
export function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Address;
  onSaved: (address: Address) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="address-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = new FormData(e.currentTarget);
        const body = Object.fromEntries(
          ['name', 'phone', 'line1', 'line2', 'city', 'stateCode', 'postalCode'].map((key) => [
            key,
            form.get(key),
          ]),
        );
        try {
          const address = await api<Address>(`addresses${initial ? `/${initial.id}` : ''}`, {
            method: initial ? 'PUT' : 'POST',
            body: JSON.stringify({ ...body, country: 'IN' }),
          });
          await onSaved(address);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Could not save address.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="form-row">
        <label>
          Full name
          <input
            className="input"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            defaultValue={initial?.name}
          />
        </label>
        <label>
          Mobile number
          <input
            className="input"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            pattern="(\+91)?[6-9][0-9]{9}"
            placeholder="9876543210"
            defaultValue={initial?.phone}
          />
        </label>
      </div>
      <label>
        Address line 1
        <input
          className="input"
          name="line1"
          autoComplete="address-line1"
          required
          minLength={3}
          maxLength={160}
          placeholder="House, street, area"
          defaultValue={initial?.line1}
        />
      </label>
      <label>
        Address line 2 <span className="muted">(optional)</span>
        <input
          className="input"
          name="line2"
          autoComplete="address-line2"
          maxLength={160}
          defaultValue={initial?.line2}
        />
      </label>
      <div className="form-row">
        <label>
          City
          <input
            className="input"
            name="city"
            autoComplete="address-level2"
            required
            minLength={2}
            maxLength={80}
            defaultValue={initial?.city}
          />
        </label>
        <label>
          PIN code
          <input
            className="input"
            name="postalCode"
            autoComplete="postal-code"
            inputMode="numeric"
            required
            pattern="[1-9][0-9]{5}"
            maxLength={6}
            defaultValue={initial?.postalCode}
          />
        </label>
      </div>
      <label>
        State or union territory
        <select
          className="input"
          name="stateCode"
          autoComplete="address-level1"
          required
          defaultValue={initial?.stateCode ?? ''}
        >
          <option value="" disabled>
            Select state
          </option>
          {states.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <>
              <Check size={17} /> Save address
            </>
          )}
        </button>
        {onCancel && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
export function AddressText({ address }: { address: Omit<Address, 'id'> }) {
  return (
    <>
      <strong>{address.name}</strong>
      <p>
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ''}
        <br />
        {address.city}, {address.stateCode} {address.postalCode}
        <br />
        {address.phone}
      </p>
    </>
  );
}
function AddressBook() {
  const { notify } = useStore();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      setAddresses(await api<Address[]>('addresses'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load addresses.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="address-book">
      <div className="section-heading">
        <h2>Your addresses.</h2>
        <button className="text-link" onClick={() => setEditing('new')}>
          <Plus size={17} /> Add new
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : (
        <div className="address-grid">
          {addresses.map((a) => (
            <div className="panel address-card" key={a.id}>
              <MapPin size={20} />
              <AddressText address={a} />
              <div>
                <button className="text-link" onClick={() => setEditing(a)}>
                  <Pencil size={14} /> Edit
                </button>
                <button
                  className="text-link danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`addresses/${a.id}`, { method: 'DELETE' });
                      await load();
                      notify('Address removed. Existing order addresses stay unchanged.');
                    } catch (e) {
                      notify(e instanceof Error ? e.message : 'Could not remove address.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !addresses.length && !editing && (
        <div className="panel">
          <p>No addresses yet. Add one for your next checkout.</p>
          <button className="button secondary" onClick={() => setEditing('new')}>
            <Plus size={17} /> Add an address
          </button>
        </div>
      )}
      {editing && (
        <div className="panel address-editor">
          <h3>{editing === 'new' ? 'A new little destination.' : 'Update your address.'}</h3>
          <AddressForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              await load();
              setEditing(null);
              notify('Address saved.');
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CartPage({ whatsappNumber }: { whatsappNumber?: string }) {
  const { cart, ready, products, customer, busy, setQuantity } = useStore();
  const subtotal = cart.subtotalPaise;
  const whatsapp = whatsappOrderUrl(whatsappNumber, cart.items);
  const shipping = subtotal !== null && subtotal >= 99900 ? 0 : 5900;
  return (
    <section className="container section purchase-page">
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Your bag</span>
      </div>
      <div className="page-title">
        <div className="eyebrow">GOOD CHOICES, ALL AROUND</div>
        <h1>Your bag of happy.</h1>
        <p>A little goodness for your pantry.</p>
      </div>
      {!ready ? (
        <Loading />
      ) : !cart.items.length ? (
        <div className="empty-state">
          <ShoppingBag />
          <h2>A little room for goodness.</h2>
          <p>Your bag is empty. Let’s find something lovely.</p>
          <Link href="/shop" className="button primary">
            Explore the pantry <ArrowUpRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div>
            <div className="shipping-progress">
              <Truck size={21} />
              <div>
                <strong>
                  {subtotal !== null && subtotal >= 99900
                    ? 'A little extra joy: free shipping!'
                    : `${money(Math.max(0, 99900 - (subtotal ?? 0)))} away from free shipping`}
                </strong>
                <div className="progress-track">
                  <span style={{ width: `${Math.min(100, (subtotal ?? 0) / 999)}%` }} />
                </div>
              </div>
            </div>
            <div className="cart-items">
              {cart.items.map((item) => {
                const product = products.find((p) => p.variants.some((v) => v.sku === item.sku));
                return (
                  <article className="cart-item" key={item.sku}>
                    <Link
                      href={product ? `/products/${product.slug}` : '/shop'}
                      className="cart-item-image"
                    >
                      <FoodVisual
                        category={product?.category ?? 'nuts'}
                        image={product?.images[0]}
                      />
                    </Link>
                    <div className="cart-item-copy">
                      <span className="eyebrow">
                        {product?.category.replace('-', ' ') ?? 'Your pantry'}
                      </span>
                      <h3>
                        <Link href={product ? `/products/${product.slug}` : '/shop'}>
                          {item.name ?? product?.name ?? item.sku}
                        </Link>
                      </h3>
                      <p>{item.weightGrams ? weight(item.weightGrams) : item.sku}</p>
                      {!item.available && (
                        <span className="item-issue">
                          {item.issue === 'PRODUCT_UNAVAILABLE'
                            ? 'No longer available. Please remove this item.'
                            : 'Not enough stock. Reduce quantity or resume your existing checkout.'}
                        </span>
                      )}
                      <div className="quantity-control">
                        <button
                          disabled={busy}
                          aria-label={`Decrease ${item.name ?? item.sku} quantity`}
                          onClick={() => void setQuantity(item.sku, item.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          disabled={busy || item.quantity >= 20}
                          aria-label={`Increase ${item.name ?? item.sku} quantity`}
                          onClick={() => void setQuantity(item.sku, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="cart-item-price">
                      <strong>
                        {item.lineTotalPaise !== null ? money(item.lineTotalPaise) : 'Unavailable'}
                      </strong>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${item.name ?? item.sku}`}
                        disabled={busy}
                        onClick={() => void setQuantity(item.sku, 0)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <Link className="text-link" href="/shop">
              A little more browsing <ArrowRight size={17} />
            </Link>
          </div>
          <aside className="panel order-summary">
            <span className="eyebrow">THE GOODNESS, ADDED UP</span>
            <h2>Bag summary</h2>
            <div className="summary-row">
              <span>Item subtotal</span>
              <span>{subtotal === null ? 'Unavailable' : money(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Estimated shipping</span>
              <span>{shipping ? money(shipping) : <span className="green">On us</span>}</span>
            </div>
            <div className="summary-total">
              <span>Estimated total</span>
              <strong>{subtotal === null ? '—' : money(subtotal + shipping)}</strong>
            </div>
            {cart.canCheckout ? (
              <Link
                className="button primary full"
                href={customer ? '/checkout' : '/account?next=/checkout'}
              >
                Continue to checkout <ArrowRight size={18} />
              </Link>
            ) : (
              <button className="button primary full" disabled>
                Review unavailable items
              </button>
            )}
            {whatsapp && (
              <a
                className="button secondary full whatsapp-order"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              >
                Request order on WhatsApp <ArrowUpRight size={16} />
              </a>
            )}
            <p className="summary-note">
              Preview checkout is available. Payments and delivery bookings haven’t opened yet.
            </p>
            {!customer && (
              <p className="summary-note">Sign in at the next step to save your bag.</p>
            )}
            {customer && (
              <Link href="/checkout" className="text-link small">
                Resume an existing checkout <ArrowUpRight size={14} />
              </Link>
            )}
            <div className="summary-footer">
              <Flower2 size={19} /> A little goodness, picked by you.
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export const statusLabel = (value: string) =>
  ({
    PENDING_PAYMENT: 'Awaiting payment',
    PREPARING: 'Stock reserved',
    PAYMENT_PENDING: 'Awaiting payment',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
    COMPLETED: 'Completed',
    UNPAID: 'Not paid',
    CAPTURED: 'Paid',
    UNFULFILLED: 'Not dispatched',
  })[value] ?? value.replaceAll('_', ' ').toLowerCase();
export function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { customer } = useStore();
  useEffect(() => {
    if (!customer) return;
    let alive = true;
    setLoading(true);
    setError('');
    void api<Order[]>(`orders?page=${page}&limit=10`)
      .then((value) => {
        if (alive) setOrders(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, customer, retry]);
  return (
    <section className="container section">
      <div className="page-title">
        <div className="eyebrow">YOUR PANTRY JOURNEY</div>
        <h1>Your little orders.</h1>
        <p>Every good choice, all in one place.</p>
      </div>
      <Guard next="/orders">
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="form-error" role="alert">
            {error}
            <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="orders-list">
              {orders.map((order) => (
                <Link
                  className="panel order-card"
                  href={`/orders/${order.orderId}`}
                  key={order.orderId}
                >
                  <div className="order-card-icon">
                    <Package size={24} />
                  </div>
                  <div>
                    <span className="eyebrow">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'Asia/Kolkata',
                      })}
                    </span>
                    <h3>Order {order.orderId.slice(0, 8).toUpperCase()}</h3>
                    <p>{order.items.map((i) => i.name ?? i.sku).join(', ')}</p>
                  </div>
                  <span className={`status-pill status-${order.status.toLowerCase()}`}>
                    {statusLabel(order.status)}
                  </span>
                  <strong>{money(order.totals.totalPaise)}</strong>
                  <ArrowUpRight size={19} />
                </Link>
              ))}
            </div>
            {!orders.length && (
              <div className="empty-state">
                <Package />
                <h2>
                  {page === 1 ? 'Your story starts with a little bite.' : 'You’re all caught up.'}
                </h2>
                <p>
                  {page === 1
                    ? 'Your orders will appear here. Until then, meet the pantry.'
                    : 'There are no more orders on this page.'}
                </p>
                <Link className="button primary" href="/shop">
                  Explore the pantry <ArrowRight size={17} />
                </Link>
              </div>
            )}
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="button secondary"
                disabled={orders.length < 10}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Guard>
    </section>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const { customer } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!customer) return;
    let alive = true;
    void api<Order>(`orders/${encodeURIComponent(id)}`)
      .then((o) => {
        if (alive) setOrder(o);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, customer]);
  return (
    <section className="container section">
      <div className="breadcrumbs">
        <Link href="/orders">Your orders</Link>
        <span>/</span>
        <span>Order details</span>
      </div>
      <Guard next="/orders">
        {error ? (
          <div className="empty-state">
            <h1>We couldn’t find that order.</h1>
            <p>{error}</p>
            <Link href="/orders" className="button primary">
              Back to your orders
            </Link>
          </div>
        ) : !order ? (
          <Loading />
        ) : (
          <>
            <div className="page-title">
              <div className="eyebrow">YOUR PANTRY JOURNEY</div>
              <h1>Order {order.orderId.slice(0, 8).toUpperCase()}</h1>
              <span className={`status-pill status-${order.status.toLowerCase()}`}>
                {statusLabel(order.status)}
              </span>
            </div>
            <div className="checkout-layout">
              <div className="panel">
                <h2>The little details.</h2>
                <div className="summary-row">
                  <span>Payment</span>
                  <strong>{statusLabel(order.paymentStatus)}</strong>
                </div>
                <div className="summary-row">
                  <span>Delivery</span>
                  <strong>{statusLabel(order.fulfillmentStatus)}</strong>
                </div>
                {order.trackingNumber && (
                  <div className="summary-row">
                    <span>Tracking</span>
                    <strong>
                      {order.carrier} · {order.trackingNumber}
                    </strong>
                  </div>
                )}
                <hr />
                <h3>Delivery address</h3>
                <AddressText address={order.address} />
                <p className="muted">
                  {order.totals.pricingMode === 'DEMO'
                    ? 'Checkout preview. No payment or delivery booking has been made.'
                    : ''}
                </p>
              </div>
              <div className="panel order-summary">
                <h2>Your goodness.</h2>
                {order.items.map((i) => (
                  <div className="summary-row" key={i.sku}>
                    <span>
                      {i.name} · {weight(i.weightGrams ?? 0)} × {i.quantity}
                    </span>
                    <strong>{money(i.lineTotalPaise ?? 0)}</strong>
                  </div>
                ))}
                {!!order.totals.discountPaise && (
                  <div className="summary-row">
                    <span>Discount · {order.totals.couponCode}</span>
                    <span>−{money(order.totals.discountPaise)}</span>
                  </div>
                )}
                <div className="summary-row">
                  <span>Shipping</span>
                  <span>
                    {order.totals.shippingPaise ? money(order.totals.shippingPaise) : 'On us'}
                  </span>
                </div>
                <div className="summary-total">
                  <span>Total</span>
                  <strong>{money(order.totals.totalPaise)}</strong>
                </div>
                <Link href="/checkout" className="text-link">
                  View active checkout <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </>
        )}
      </Guard>
    </section>
  );
}
