'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Minus, Plus, ShoppingBag, Trash2, Truck, X } from 'lucide-react';
import { money, weight } from '@/lib/types';
import { whatsappOrderUrl } from '@/lib/whatsapp';
import { FoodVisual } from './food-visual';
import { useStore } from './store-provider';

export function BagPreview({
  whatsappNumber,
  onOpen,
}: {
  whatsappNumber?: string;
  onOpen: () => void;
}) {
  const { cart, products, ready, busy, notice, setQuantity } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const whatsapp = cart.items.length ? whatsappOrderUrl(whatsappNumber, cart.items) : undefined;
  const subtotal = cart.subtotalPaise;
  const remaining = subtotal === null ? null : Math.max(0, 99900 - subtotal);

  function close() {
    dialog.current?.close();
  }

  async function updateQuantity(sku: string, quantity: number) {
    setShowUpdateNotice(false);
    if (!(await setQuantity(sku, quantity))) setShowUpdateNotice(true);
  }

  return (
    <>
      <Link
        ref={trigger}
        href="/cart"
        className="bag-button"
        aria-label={`Shopping bag, ${count} ${count === 1 ? 'item' : 'items'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="bag-preview"
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const panel = dialog.current;
          if (!panel?.showModal) return;
          event.preventDefault();
          onOpen();
          setShowUpdateNotice(false);
          panel.showModal();
          setOpen(true);
          closeButton.current?.focus({ preventScroll: true });
        }}
      >
        <ShoppingBag size={21} aria-hidden="true" />
        <span className="bag-label">Bag</span>
        <span className="bag-count">{count}</span>
      </Link>
      <dialog
        id="bag-preview"
        ref={dialog}
        className="bag-preview"
        aria-labelledby="bag-preview-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="bag-preview-shell">
          <div className="bag-preview-heading">
            <div>
              <h2 id="bag-preview-title">Your bag</h2>
              <p>
                {count} {count === 1 ? 'pack' : 'packs'}
              </p>
            </div>
            <button
              ref={closeButton}
              className="icon-button"
              type="button"
              aria-label="Close bag"
              onClick={close}
            >
              <X size={22} />
            </button>
          </div>
          {!ready ? (
            <p className="bag-preview-empty" role="status">
              Loading your bag…
            </p>
          ) : !cart.items.length ? (
            <div className="bag-preview-empty">
              <ShoppingBag size={32} aria-hidden="true" />
              <h3>Your bag is empty</h3>
              <Link href="/shop" className="button primary" onClick={close}>
                Shop the pantry <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <>
              {remaining !== null && (
                <div className="bag-preview-shipping">
                  <span>
                    <Truck size={17} aria-hidden="true" />
                    {remaining
                      ? `You’re ${money(remaining)} away from free shipping`
                      : 'Your bag qualifies for free shipping'}
                  </span>
                  <progress
                    value={99900 - remaining}
                    max={99900}
                    aria-label="Progress toward free shipping"
                  />
                </div>
              )}
              <ul className="bag-preview-items">
                {cart.items.map((item) => {
                  const product = products.find((entry) => entry.slug === item.productSlug);
                  const name = item.name ?? product?.name ?? item.sku;
                  const size = item.weightGrams ? weight(item.weightGrams) : item.sku;
                  return (
                    <li key={item.sku} className="bag-preview-item">
                      <div className="bag-preview-photo">
                        {product ? (
                          <FoodVisual category={product.category} image={product.images[0]} />
                        ) : (
                          <ShoppingBag size={22} aria-hidden="true" />
                        )}
                      </div>
                      <div className="bag-preview-item-info">
                        <strong>
                          {product ? (
                            <Link href={`/products/${product.slug}`} onClick={close}>
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </strong>
                        <p>
                          {size}
                          {!item.available && ' · Unavailable'}
                        </p>
                        <div
                          className="quantity-control"
                          role="group"
                          aria-label={`Quantity for ${name}, ${size}`}
                        >
                          <button
                            type="button"
                            disabled={busy}
                            aria-label="Decrease quantity"
                            onClick={() => void updateQuantity(item.sku, item.quantity - 1)}
                          >
                            <Minus size={14} />
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            type="button"
                            disabled={busy || !item.available || item.quantity >= 20}
                            aria-label="Increase quantity"
                            onClick={() => void updateQuantity(item.sku, item.quantity + 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="bag-preview-item-actions">
                        <strong>
                          {item.lineTotalPaise === null ? '—' : money(item.lineTotalPaise)}
                        </strong>
                        <button
                          type="button"
                          className="icon-button"
                          disabled={busy}
                          aria-label={`Remove ${name}, ${size}`}
                          onClick={() => void updateQuantity(item.sku, 0)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="bag-preview-summary">
                <div className="summary-row">
                  <span>Item subtotal</span>
                  <strong>{subtotal === null ? 'Unavailable' : money(subtotal)}</strong>
                </div>
                {cart.canCheckout ? (
                  <Link href="/checkout" className="button primary full" onClick={close}>
                    Continue to checkout <ArrowRight size={16} />
                  </Link>
                ) : (
                  <p className="bag-preview-note">Review unavailable items before checkout.</p>
                )}
                {whatsapp && (
                  <a
                    className="button secondary full"
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Request order on WhatsApp <ArrowUpRight size={16} />
                  </a>
                )}
                <Link className="text-link" href="/cart" onClick={close}>
                  View full bag
                </Link>
              </div>
            </>
          )}
          {open && (
            <p className="bag-preview-note" role="status">
              {showUpdateNotice ? notice : ''}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
