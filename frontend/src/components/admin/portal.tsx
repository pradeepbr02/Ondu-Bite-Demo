'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ClipboardList,
  Tag,
  History,
  ArrowUpRight,
  LogOut,
  RefreshCw,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { api, apiEnvelope } from '@/lib/api';
import { money, weight } from '@/lib/types';
import { useStore } from '../store-provider';
import { Brand } from '../shell';
import { ProductEditor, CouponEditor, StockEditor, OrderEditor } from './editors';
import type { AdminProduct, AdminOrder, Stock, Coupon, Audit } from './types';

type Section = 'overview' | 'orders' | 'products' | 'inventory' | 'discounts' | 'audit' | 'access';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'discounts', label: 'Discounts', icon: Tag },
  { id: 'access', label: 'Admin access', icon: ShieldCheck },
  { id: 'audit', label: 'Activity', icon: History },
] as const;
const label = (s: string) => s.toLowerCase().replaceAll('_', ' ');
export function Badge({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return <span className={`admin-badge ${good ? 'good' : ''}`}>{children}</span>;
}
export function AdminPortal() {
  const { customer, ready, logout } = useStore();
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [accessError, setAccessError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!ready || !customer) return;
    let cancelled = false;
    setAccess('loading');
    api('admin/me')
      .then(() => {
        if (!cancelled) setAccess('allowed');
      })
      .catch((e) => {
        if (!cancelled) {
          setAccess('denied');
          setAccessError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, customer?.id, revision]);
  if (!ready || (customer && access === 'loading'))
    return (
      <div className="admin-gate" role="status">
        <Brand />
        <p>Checking your access…</p>
      </div>
    );
  if (!customer || access !== 'allowed')
    return (
      <main className="admin-gate">
        <Brand />
        <ShieldCheck size={40} />
        <div className="eyebrow">ONDU PACKET · ADMINISTRATION</div>
        <h1>Your pantry, behind the scenes.</h1>
        <p>
          {customer ? accessError : 'Sign in with your administrator account to manage the store.'}
        </p>
        {customer ? (
          <>
            <p>An existing account must be granted the admin role by the store owner.</p>
            <button className="button primary" onClick={() => setRevision((v) => v + 1)}>
              Check access again
            </button>
            <Link className="text-link" href="/account">
              Manage your account
            </Link>
          </>
        ) : (
          <Link className="button primary" href="/account?next=%2Fadmin">
            Sign in to administration <ArrowUpRight size={17} />
          </Link>
        )}
        <Link className="text-link" href="/">
          Back to storefront
        </Link>
      </main>
    );
  return (
    <div className="admin-app">
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>
      <aside className="admin-sidebar">
        <Brand />
        <div className="admin-workspace">
          <ShieldCheck size={17} /> Store administration
        </div>
        <nav aria-label="Admin navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-current={section === n.id ? 'page' : undefined}
              className={section === n.id ? 'selected' : ''}
              onClick={() => {
                setSection(n.id);
                setNotice('');
              }}
            >
              <n.icon size={19} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/">
            Visit storefront <ArrowUpRight size={16} />
          </Link>
          <span>
            {customer.name}
            <small>{customer.email}</small>
          </span>
          <button onClick={() => void logout().catch((e) => setNotice(e.message))}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      <div className="admin-workspace-body">
        <header className="admin-topbar">
          <span>
            <span className="admin-live-dot" /> Ondu Packet /{' '}
            <strong>{navigation.find((n) => n.id === section)?.label}</strong>
          </span>
          <div className="admin-topbar-actions">
            <Badge>Store preview</Badge>
            <button
              className="admin-mobile-signout"
              aria-label="Sign out of administration"
              onClick={() => void logout().catch((e) => setNotice(e.message))}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main id="admin-main" className="admin-main">
          {notice && (
            <div className="admin-notice" role="status">
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          )}
          {section === 'access' ? (
            <AdminAccess onSaved={setNotice} />
          ) : (
            <AdminSection key={section} section={section} onSaved={setNotice} />
          )}
        </main>
        <footer className="admin-footer">
          Ondu Packet · Store operations <span>India · INR</span>
        </footer>
      </div>
    </div>
  );
}

function AdminAccess({ onSaved }: { onSaved: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = new FormData(form);
    setSaving(true);
    setError('');
    onSaved('');
    try {
      const result = await api<{ email: string; role: 'admin' | 'customer'; changed: boolean }>(
        'admin/access',
        {
          method: 'PUT',
          body: JSON.stringify({ email: details.get('email'), role: details.get('role') }),
        },
      );
      const access = result.role === 'admin' ? 'admin access' : 'customer access';
      onSaved(
        result.changed
          ? `${result.email} now has ${access} and will need to sign in again.`
          : `${result.email} already has ${access}.`,
      );
      form.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update admin access.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Admin access</h1>
          <p>Grant or revoke access for a registered storefront account.</p>
        </div>
      </div>
      <form className="admin-card admin-editor" onSubmit={save}>
        <fieldset className="admin-form-grid" disabled={saving}>
          <label>
            Account email
            <input name="email" type="email" autoComplete="off" maxLength={254} required />
          </label>
          <label>
            Action
            <select name="role" defaultValue="" required>
              <option value="" disabled>
                Choose an action
              </option>
              <option value="admin">Grant admin access</option>
              <option value="customer">Revoke admin access</option>
            </select>
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="admin-form-actions">
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? 'Updating access…' : 'Update access'}
          </button>
        </div>
      </form>
    </>
  );
}

function AdminSection({
  section,
  onSaved,
}: {
  section: Exclude<Section, 'access'>;
  onSaved: (s: string) => void;
}) {
  const [rows, setRows] = useState<(AdminProduct | AdminOrder | Stock | Coupon | Audit)[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<ReactNode>(null);
  const saved = (message: string) => {
    setEditor(null);
    setRefresh((r) => r + 1);
    onSaved(message);
  };
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: '20', q: query });
    if (status) params.set('status', status);
    if (fulfillment) params.set('fulfillmentStatus', fulfillment);
    const request =
      section === 'overview'
        ? api<Record<string, number>>('admin/summary').then((data) => {
            if (!cancelled) setSummary(data);
          })
        : apiEnvelope<typeof rows>(`admin/${section}?${params}`).then((result) => {
            if (!cancelled) {
              setRows(result.data);
              setPages(result.pagination?.totalPages ?? 1);
            }
          });
    request
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, page, query, status, fulfillment, refresh]);
  const title = {
    overview: 'A good day starts here.',
    products: 'The pantry collection.',
    inventory: 'Every pack accounted for.',
    orders: 'From your pantry to theirs.',
    discounts: 'A little extra goodness.',
    audit: 'Your store’s activity.',
  }[section];
  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">YOUR STORE, AT A GLANCE</div>
          <h1>{title}</h1>
          <p>
            {section === 'overview'
              ? 'A clear view of your products, stock and orders.'
              : `Manage ${section === 'audit' ? 'store changes and accountability' : section} for Ondu Packet.`}
          </p>
        </div>
        <div className="admin-actions">
          <button
            className="admin-icon-button"
            aria-label="Refresh data"
            disabled={loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
          {section === 'products' && (
            <button
              className="button primary"
              onClick={() =>
                setEditor(
                  <ProductEditor
                    onCancel={() => setEditor(null)}
                    onSaved={() => saved('Product saved.')}
                  />,
                )
              }
            >
              <Plus size={17} /> Add product
            </button>
          )}
          {section === 'discounts' && (
            <button
              className="button primary"
              onClick={() =>
                setEditor(
                  <CouponEditor
                    onCancel={() => setEditor(null)}
                    onSaved={() => saved('Discount saved.')}
                  />,
                )
              }
            >
              <Plus size={17} /> New discount
            </button>
          )}
        </div>
      </div>
      {editor ? (
        <section className="admin-card admin-editor">{editor}</section>
      ) : (
        <>
          {section !== 'overview' && (
            <div className="admin-toolbar">
              {section !== 'audit' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPage(1);
                    setQuery(search);
                  }}
                >
                  <Search size={18} />
                  <input
                    aria-label={`Search ${section}`}
                    placeholder={
                      section === 'orders'
                        ? 'Search order ID…'
                        : section === 'inventory'
                          ? 'Search SKU…'
                          : `Search ${section}…`
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button type="submit">Search</button>
                </form>
              )}
              {section === 'orders' && (
                <>
                  <select
                    aria-label="Order status filter"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All order statuses</option>
                    {['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REVIEW'].map(
                      (s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    aria-label="Fulfillment filter"
                    value={fulfillment}
                    onChange={(e) => {
                      setFulfillment(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All fulfillment statuses</option>
                    {['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
          {error ? (
            <div className="admin-card form-error" role="alert">
              {error}
              <button className="text-link" onClick={() => setRefresh((v) => v + 1)}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="admin-card admin-loading" role="status">
              Loading {section}…
            </div>
          ) : section === 'overview' ? (
            <>
              <div className="admin-stat-grid">
                {[
                  ['products', 'Active products', Package],
                  ['orders', 'Total orders', ClipboardList],
                  ['toFulfill', 'Ready to fulfill', Boxes],
                  ['lowStock', 'Low stock SKUs', Tag],
                ].map(([key, name, Icon]) => {
                  const StatIcon = Icon as typeof Package;
                  return (
                    <div className="admin-card admin-stat" key={String(key)}>
                      <span>
                        {String(name)}
                        <StatIcon size={20} />
                      </span>
                      <strong>{summary[String(key)] ?? 0}</strong>
                      <small>
                        {key === 'lowStock'
                          ? '5 or fewer packs available'
                          : key === 'toFulfill'
                            ? 'Paid and confirmed orders'
                            : 'Live from your store'}
                      </small>
                    </div>
                  );
                })}
              </div>
              <div className="admin-overview-grid">
                <section className="admin-card">
                  <div className="eyebrow">ORDER OPERATIONS</div>
                  <h2>A little care at every step.</h2>
                  <p>
                    <strong>{summary.awaitingPayment ?? 0}</strong> orders are awaiting payment.
                    Only confirmed, paid orders can be processed and shipped.
                  </p>
                  <div className="admin-steps">
                    <span>Confirmed</span>
                    <span>Processing</span>
                    <span>Shipped</span>
                    <span>Delivered</span>
                  </div>
                </section>
                <section className="admin-card admin-tip">
                  <Tag size={28} />
                  <h2>Make room for good things.</h2>
                  <p>
                    Add products, stock each pack size separately, and create a coupon for your next
                    campaign.
                  </p>
                  <small>
                    Payments are still in preview. No payment confirmation is available in this
                    portal.
                  </small>
                </section>
              </div>
            </>
          ) : (
            <section className="admin-card admin-table-card">
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {(section === 'products'
                        ? ['Product', 'Category', 'Visibility', 'Action']
                        : section === 'inventory'
                          ? ['SKU', 'On hand', 'Reserved', 'Available', 'Action']
                          : section === 'orders'
                            ? ['Order', 'Customer', 'Total', 'Payment / fulfillment', 'Action']
                            : section === 'discounts'
                              ? ['Code', 'Discount', 'Validity', 'Status', 'Action']
                              : ['Time', 'Change', 'Record', 'Actor']
                      ).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      if (section === 'products') {
                        const p = row as AdminProduct;
                        return (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <small>/{p.slug}</small>
                            </td>
                            <td>{p.categoryName ?? p.categoryId}</td>
                            <td>
                              <Badge good={p.active}>{p.active ? 'Active' : 'Hidden'}</Badge>
                            </td>
                            <td>
                              <button
                                className="text-link"
                                onClick={() =>
                                  setEditor(
                                    <ProductEditor
                                      productId={p.id}
                                      onCancel={() => setEditor(null)}
                                      onSaved={() => saved('Product updated.')}
                                    />,
                                  )
                                }
                              >
                                Edit product
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      if (section === 'inventory') {
                        const s = row as Stock;
                        return (
                          <tr key={s.sku}>
                            <td>
                              <strong>{s.sku}</strong>
                            </td>
                            <td>{s.onHand}</td>
                            <td>{s.reserved}</td>
                            <td>
                              <Badge good={s.available > 5}>{s.available} packs</Badge>
                            </td>
                            <td>
                              <button
                                className="text-link"
                                onClick={() =>
                                  setEditor(
                                    <StockEditor
                                      stock={s}
                                      onCancel={() => setEditor(null)}
                                      onSaved={() => saved('Stock adjustment recorded.')}
                                    />,
                                  )
                                }
                              >
                                Adjust stock
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      if (section === 'orders') {
                        const o = row as AdminOrder;
                        return (
                          <tr key={o.orderId}>
                            <td>
                              <strong className="admin-mono">{o.orderId.slice(0, 8)}</strong>
                              <small>{new Date(o.createdAt).toLocaleDateString('en-IN')}</small>
                            </td>
                            <td>
                              {o.address.name}
                              <small>{o.items.reduce((n, x) => n + x.quantity, 0)} packs</small>
                            </td>
                            <td>{money(o.totals.totalPaise)}</td>
                            <td>
                              <Badge good={o.paymentStatus === 'CAPTURED'}>{label(o.status)}</Badge>
                              <small>
                                {label(o.paymentStatus)} · {label(o.fulfillmentStatus)}
                              </small>
                            </td>
                            <td>
                              <button
                                className="text-link"
                                onClick={() =>
                                  setEditor(
                                    <OrderEditor
                                      orderId={o.orderId}
                                      onCancel={() => setEditor(null)}
                                      onSaved={() => saved('Fulfillment updated.')}
                                    />,
                                  )
                                }
                              >
                                View order
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      if (section === 'discounts') {
                        const d = row as Coupon;
                        const live =
                          d.active &&
                          Date.now() >= Date.parse(d.startsAt) &&
                          Date.now() < Date.parse(d.endsAt);
                        return (
                          <tr key={d.id}>
                            <td>
                              <strong>{d.code}</strong>
                              <small>Min. {money(d.minSubtotalPaise)}</small>
                            </td>
                            <td>{d.kind === 'PERCENT' ? `${d.value}%` : money(d.value)} off</td>
                            <td>
                              {new Date(d.endsAt).toLocaleDateString('en-IN')}
                              <small>Ends</small>
                            </td>
                            <td>
                              <Badge good={live}>
                                {!d.active
                                  ? 'Disabled'
                                  : live
                                    ? 'Live'
                                    : Date.now() < Date.parse(d.startsAt)
                                      ? 'Scheduled'
                                      : 'Expired'}
                              </Badge>
                            </td>
                            <td>
                              <button
                                className="text-link"
                                onClick={() =>
                                  setEditor(
                                    <CouponEditor
                                      initial={d}
                                      onCancel={() => setEditor(null)}
                                      onSaved={() => saved('Discount updated.')}
                                    />,
                                  )
                                }
                              >
                                Edit discount
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      const a = row as Audit;
                      return (
                        <tr key={a._id ?? i}>
                          <td>{new Date(a.createdAt).toLocaleString('en-IN')}</td>
                          <td>{label(a.action)}</td>
                          <td className="admin-mono">{a.target}</td>
                          <td className="admin-mono">{a.actorId}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <div className="admin-empty">
                  <Package size={30} />
                  <h2>No {section === 'audit' ? 'activity' : section} found.</h2>
                  <p>{query ? 'Try another search.' : 'Your store records will appear here.'}</p>
                </div>
              )}
              <div className="admin-pagination">
                <span>
                  Page {page} of {Math.max(1, pages)}
                </span>
                <div>
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
