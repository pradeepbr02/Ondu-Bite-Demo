'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Plus, Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import { money, weight } from '@/lib/types';
import type { AdminProduct, AdminCategory, AdminOrder, Coupon, Stock } from './types';
type Props = { onCancel: () => void; onSaved: () => void };
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Could not save. Please try again.';
const split = (s: string) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
const rupeesToPaise = (s: FormDataEntryValue | null) => Math.round(Number(s ?? 0) * 100);
function FormHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  return (
    <div className="admin-editor-heading">
      <button type="button" className="text-link" onClick={onCancel}>
        <ArrowLeft size={16} /> Back to list
      </button>
      <h2>{title}</h2>
    </div>
  );
}
function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="admin-form-actions">
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
      <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}

export function ProductEditor({ productId, onCancel, onSaved }: Props & { productId?: string }) {
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [variants, setVariants] = useState([
    { sku: '', weightGrams: 250, pricePaise: 0, active: true },
  ]);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api<AdminCategory[]>('admin/categories'),
      productId ? api<AdminProduct>(`admin/products/${productId}`) : Promise.resolve(null),
    ])
      .then(([c, p]) => {
        if (!cancelled) {
          setCategories(c);
          setProduct(p);
          if (p) {
            setVariants(p.variants);
            setImages(p.images);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, retry]);
  if (loading) return <p role="status">Loading product editor…</p>;
  if (!categories.length || (productId && !product))
    return (
      <>
        <FormHeader title="Product editor" onCancel={onCancel} />
        <p className="form-error" role="alert">
          {error || 'No categories available. Seed the catalog first.'}
        </p>
        <button className="button secondary" onClick={() => setRetry((r) => r + 1)}>
          Reload editor
        </button>
      </>
    );
  return (
    <>
      <FormHeader title={productId ? 'Edit product' : 'Add something good.'} onCancel={onCancel} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const data = new FormData(e.currentTarget);
          const input = {
            name: data.get('name'),
            kannadaName: data.get('kannadaName'),
            slug: data.get('slug'),
            categoryId: data.get('categoryId'),
            description: data.get('description'),
            active: data.get('active') === 'on',
            images,
            imagePresentation: data.get('imagePresentation'),
            imageNote: data.get('imageNote'),
            ingredients: split(String(data.get('ingredients'))),
            allergens: split(String(data.get('allergens'))),
            variants: variants.map((v) => ({
              sku: v.sku,
              weightGrams: v.weightGrams,
              pricePaise: v.pricePaise,
              active: v.active,
            })),
            ...(product ? { revision: product.revision } : {}),
          };
          try {
            await api(productId ? `admin/products/${productId}` : 'admin/products', {
              method: productId ? 'PUT' : 'POST',
              body: JSON.stringify(input),
            });
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || uploading}>
          <div className="admin-form-grid">
            <label>
              Product name
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={product?.name}
                placeholder="Roasted almonds"
              />
            </label>
            <label>
              Kannada name (optional)
              <input
                name="kannadaName"
                lang="kn"
                maxLength={100}
                defaultValue={product?.kannadaName}
              />
            </label>
            <label>
              URL slug
              <input
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={100}
                defaultValue={product?.slug}
                placeholder="roasted-almonds"
              />
            </label>
            <label>
              Category
              <select name="categoryId" defaultValue={product?.categoryId ?? categories[0]?._id}>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {!c.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" name="active" defaultChecked={product?.active ?? false} />{' '}
              Visible in storefront
            </label>
            <label className="admin-full">
              Description
              <textarea
                name="description"
                required
                rows={4}
                maxLength={5000}
                defaultValue={product?.description}
              />
            </label>
            <label>
              Ingredients <small>Separate with commas</small>
              <input name="ingredients" defaultValue={product?.ingredients.join(', ')} />
            </label>
            <label>
              Allergens <small>Separate with commas</small>
              <input name="allergens" defaultValue={product?.allergens.join(', ')} />
            </label>
          </div>
          <div className="admin-form-section">
            <h3>Product photography</h3>
            <div className="admin-form-grid">
              <label>
                Photo layout
                <select
                  name="imagePresentation"
                  defaultValue={product?.imagePresentation ?? 'food'}
                >
                  <option value="food">Food photo (fill)</option>
                  <option value="package">Package photo (fit whole pack)</option>
                  <option value="package-scene">Package in a scene (responsive crop)</option>
                </select>
              </label>
              <label>
                Photo caption
                <input
                  name="imageNote"
                  maxLength={200}
                  defaultValue={product?.imageNote ?? ''}
                  placeholder="Optional photo credit or reference label"
                />
              </label>
            </div>
            <p>JPEG, PNG or WebP, up to 8 MB. Images are uploaded to cloud storage.</p>
            <div className="admin-image-list">
              {images.map((src, i) => (
                <div key={src} className="admin-product-image">
                  <Image src={src} alt={`Product photo ${i + 1}`} width={100} height={100} />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setImages((list) => list.filter((s) => s !== src))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            {images.length < 8 && (
              <label className="admin-upload">
                <Upload size={17} />
                {uploading ? 'Uploading to S3…' : 'Upload a photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Upload product photo"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > 8 * 1024 * 1024) {
                      setError('Choose an image smaller than 8 MB.');
                      return;
                    }
                    setUploading(true);
                    setError('');
                    try {
                      const response = await fetch('/api/store/admin/images', {
                        method: 'POST',
                        headers: { 'Content-Type': file.type },
                        body: file,
                      });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error?.message ?? 'Upload failed.');
                      setImages((list) =>
                        list.includes(result.data.path) ? list : [...list, result.data.path],
                      );
                    } catch (e) {
                      setError(message(e));
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
          <div className="admin-form-section">
            <h3>Pack sizes & pricing</h3>
            <p>
              Each SKU has its own stock. New variants start with zero stock; add packs from
              Inventory. Existing SKUs and weights cannot be changed.
            </p>
            <div className="admin-variant-list">
              {variants.map((v, i) => {
                const existing = product?.variants.some((p) => p.sku === v.sku);
                return (
                  <div className="admin-variant" key={i}>
                    <label>
                      SKU
                      <input
                        required
                        pattern="[A-Z0-9-]+"
                        maxLength={80}
                        readOnly={existing}
                        value={v.sku}
                        onChange={(e) =>
                          setVariants((list) =>
                            list.map((x, j) =>
                              i === j ? { ...x, sku: e.target.value.toUpperCase() } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Weight (g)
                      <input
                        type="number"
                        required
                        min={1}
                        max={100000}
                        readOnly={existing}
                        value={v.weightGrams}
                        onChange={(e) =>
                          setVariants((list) =>
                            list.map((x, j) =>
                              i === j ? { ...x, weightGrams: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Price (₹)
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        max="1000000"
                        value={v.pricePaise ? v.pricePaise / 100 : ''}
                        onChange={(e) =>
                          setVariants((list) =>
                            list.map((x, j) =>
                              i === j
                                ? { ...x, pricePaise: Math.round(Number(e.target.value) * 100) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={v.active}
                        onChange={(e) =>
                          setVariants((list) =>
                            list.map((x, j) => (i === j ? { ...x, active: e.target.checked } : x)),
                          )
                        }
                      />{' '}
                      Active
                    </label>
                    {!existing && variants.length > 1 && (
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setVariants((list) => list.filter((_, j) => i !== j))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {variants.length < 30 && (
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setVariants((list) => [
                    ...list,
                    {
                      sku: '',
                      weightGrams: list.some((v) => v.weightGrams === 500) ? 1000 : 500,
                      pricePaise: 0,
                      active: true,
                    },
                  ])
                }
              >
                <Plus size={16} /> Add pack size
              </button>
            )}
          </div>
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            {error}
            {error.includes('Reload') && (
              <button type="button" onClick={() => setRetry((r) => r + 1)}>
                Reload latest product
              </button>
            )}
          </div>
        )}
        <FormActions busy={busy || uploading} onCancel={onCancel} />
      </form>
    </>
  );
}

export function StockEditor({ stock, onCancel, onSaved }: Props & { stock: Stock }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const attempt = useRef<{ body: string; operationId: string } | null>(null);
  return (
    <>
      <FormHeader title={`Adjust ${stock.sku}`} onCancel={onCancel} />
      <div className="admin-stock-summary">
        <span>
          On hand <strong>{stock.onHand}</strong>
        </span>
        <span>
          Reserved <strong>{stock.reserved}</strong>
        </span>
        <span>
          Available <strong>{stock.available}</strong>
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const input = { sku: stock.sku, delta: Number(delta), reason };
          const signature = JSON.stringify(input);
          if (!attempt.current || attempt.current.body !== signature)
            attempt.current = { body: signature, operationId: crypto.randomUUID() };
          try {
            await api('admin/inventory/adjustments', {
              method: 'POST',
              body: JSON.stringify({ ...input, operationId: attempt.current.operationId }),
            });
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="admin-form-grid">
            <label>
              Change in packs
              <input
                type="number"
                required
                min={-1000000}
                max={1000000}
                step={1}
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="50 or -3"
              />
            </label>
            <label>
              Reason
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="New batch received"
              />
            </label>
          </div>
          <p>
            Positive numbers receive stock; negative numbers remove stock. Reserved packs are
            protected.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </>
  );
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function CouponEditor({ initial, onCancel, onSaved }: Props & { initial?: Coupon }) {
  const [kind, setKind] = useState<'PERCENT' | 'FIXED'>(initial?.kind ?? 'PERCENT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <FormHeader
        title={initial ? `Edit ${initial.code}` : 'Create a little offer.'}
        onCancel={onCancel}
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const d = new FormData(e.currentTarget);
          try {
            const input = {
              code: d.get('code'),
              kind,
              value: kind === 'PERCENT' ? Number(d.get('value')) : rupeesToPaise(d.get('value')),
              minSubtotalPaise: rupeesToPaise(d.get('minimum')),
              maxDiscountPaise: rupeesToPaise(d.get('cap')),
              startsAt: new Date(String(d.get('start'))).toISOString(),
              endsAt: new Date(String(d.get('end'))).toISOString(),
              active: d.get('active') === 'on',
              ...(initial ? { revision: initial.revision } : {}),
            };
            await api(initial ? `admin/discounts/${initial.id}` : 'admin/discounts', {
              method: initial ? 'PUT' : 'POST',
              body: JSON.stringify(input),
            });
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="admin-form-grid">
            <label>
              Coupon code
              <input
                name="code"
                required
                pattern="[A-Za-z0-9-]{3,30}"
                maxLength={30}
                defaultValue={initial?.code}
                placeholder="PANTRY10"
              />
            </label>
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="PERCENT">Percentage off</option>
                <option value="FIXED">Fixed amount off</option>
              </select>
            </label>
            <label>
              {kind === 'PERCENT' ? 'Discount (%)' : 'Discount (₹)'}
              <input
                key={kind}
                name="value"
                required
                type="number"
                min={kind === 'PERCENT' ? 1 : 0.01}
                max={kind === 'PERCENT' ? 100 : 1000000}
                step={kind === 'PERCENT' ? 1 : 0.01}
                defaultValue={
                  initial?.kind === kind
                    ? kind === 'PERCENT'
                      ? initial.value
                      : initial.value / 100
                    : ''
                }
              />
            </label>
            <label>
              Minimum item subtotal (₹)
              <input
                name="minimum"
                required
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                defaultValue={(initial?.minSubtotalPaise ?? 0) / 100}
              />
            </label>
            <label>
              Maximum discount (₹)
              <input
                name="cap"
                type="number"
                required
                min={0}
                max={1000000}
                step="0.01"
                defaultValue={(initial?.maxDiscountPaise ?? 0) / 100}
              />
              <small>0 means no additional cap.</small>
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />{' '}
              Enabled
            </label>
            <label>
              Starts at (your local time)
              <input
                name="start"
                required
                type="datetime-local"
                defaultValue={localDate(initial?.startsAt ?? new Date().toISOString())}
              />
            </label>
            <label>
              Ends at (your local time)
              <input
                name="end"
                required
                type="datetime-local"
                defaultValue={localDate(
                  initial?.endsAt ?? new Date(Date.now() + 7 * 86400000).toISOString(),
                )}
              />
            </label>
          </div>
          <p>
            One coupon per checkout. Applies to items, excludes shipping, and leaves at least ₹0.01
            payable. Free shipping is based on the item subtotal before discounts. Usage limits are
            not supported in this version.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}{' '}
            {error.includes('Reload') &&
              'Return to the list and reopen this discount to get the latest version.'}
          </p>
        )}
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </>
  );
}

export function OrderEditor({ orderId, onCancel, onSaved }: Props & { orderId: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<AdminOrder>(`admin/orders/${orderId}`)
      .then((o) => {
        if (!cancelled) {
          setOrder(o);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, retry]);
  const next = order
    ? (
        { UNFULFILLED: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' } as Record<
          string,
          string
        >
      )[order.fulfillmentStatus]
    : '';
  return (
    <>
      <FormHeader title="Order details" onCancel={onCancel} />
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="text-link" onClick={() => setRetry((v) => v + 1)}>
            Reload order
          </button>
        </p>
      )}
      {order ? (
        <>
          <p className="admin-mono">{order.orderId}</p>
          <div className="admin-order-grid">
            <section>
              <h3>Delivery address</h3>
              <strong>{order.address.name}</strong>
              <p>
                {order.address.line1} {order.address.line2}
                <br />
                {order.address.city}, {order.address.stateCode} {order.address.postalCode}
                <br />
                {order.address.phone}
              </p>
            </section>
            <section>
              <h3>Order status</h3>
              <p>
                {order.status} · {order.paymentStatus}
                <br />
                Fulfillment: {order.fulfillmentStatus}
              </p>
              {order.trackingNumber && (
                <p>
                  {order.carrier} · {order.trackingNumber}
                </p>
              )}
            </section>
          </div>
          <div className="admin-form-section">
            <h3>Items</h3>
            {order.items.map((i) => (
              <div key={i.sku} className="summary-row">
                <span>
                  {i.name} · {weight(i.weightGrams ?? 0)} × {i.quantity}
                  <small className="admin-block">{i.sku}</small>
                </span>
                <strong>{money(i.lineTotalPaise ?? 0)}</strong>
              </div>
            ))}
            <div className="summary-row">
              <span>Item subtotal</span>
              <span>{money(order.totals.subtotalPaise)}</span>
            </div>
            {!!order.totals.discountPaise && (
              <div className="summary-row">
                <span>Discount · {order.totals.couponCode}</span>
                <span>−{money(order.totals.discountPaise)}</span>
              </div>
            )}
            <div className="summary-row">
              <span>Shipping</span>
              <span>{money(order.totals.shippingPaise)}</span>
            </div>
            <div className="summary-total">
              <span>Total</span>
              <strong>{money(order.totals.totalPaise)}</strong>
            </div>
          </div>
          {next && order.status === 'CONFIRMED' && order.paymentStatus === 'CAPTURED' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                setBusy(true);
                setError('');
                try {
                  await api(`admin/orders/${orderId}/fulfillment`, {
                    method: 'PUT',
                    body: JSON.stringify({
                      expectedStatus: order.fulfillmentStatus,
                      status: next,
                      carrier: String(d.get('carrier') ?? ''),
                      trackingNumber: String(d.get('tracking') ?? ''),
                    }),
                  });
                  onSaved();
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>Update fulfillment</h3>
              <fieldset disabled={busy}>
                {next === 'SHIPPED' && (
                  <div className="admin-form-grid">
                    <label>
                      Carrier
                      <input
                        name="carrier"
                        required
                        maxLength={100}
                        placeholder="Delivery partner"
                      />
                    </label>
                    <label>
                      Tracking number
                      <input name="tracking" required maxLength={120} />
                    </label>
                  </div>
                )}
                <p>
                  Next stage: <strong>{next.toLowerCase()}</strong>. This records fulfillment only;
                  arrange delivery with your shipping partner separately.
                </p>
                <button className="button primary" disabled={busy}>
                  {busy ? 'Saving…' : `Mark ${next.toLowerCase()}`}
                </button>
              </fieldset>
            </form>
          ) : (
            <p className="admin-callout">
              {order.paymentStatus !== 'CAPTURED'
                ? 'Fulfillment is unavailable until a payment is captured and the order is confirmed.'
                : 'No further fulfillment transition is available.'}
            </p>
          )}
        </>
      ) : (
        !error && <p role="status">Loading order…</p>
      )}
    </>
  );
}
