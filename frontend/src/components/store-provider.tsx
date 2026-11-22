'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, apiEnvelope, ApiError } from '@/lib/api';
import { collectCatalog } from '@/lib/catalog-pages';
import type { Cart, CartInput, Category, Customer, Product } from '@/lib/types';

const emptyCart: Cart = {
  revision: 0,
  currency: 'INR',
  items: [],
  subtotalPaise: 0,
  canCheckout: false,
};
const guestKey = 'ondu-packet-guest-cart-v1';
const legacyGuestKey = 'nalla-guest-cart-v1';
const catalogRetryDelays = [3000, 10000, 20000];
type Context = {
  products: Product[];
  categories: Category[];
  catalogError: string | null;
  reloadCatalog: () => Promise<void>;
  customer: Customer | null;
  ready: boolean;
  cart: Cart;
  busy: boolean;
  notice: string;
  notify: (message: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  addItem: (sku: string, quantity?: number) => Promise<boolean>;
  setQuantity: (sku: string, quantity: number) => Promise<boolean>;
  refreshCart: () => Promise<void>;
};
const StoreContext = createContext<Context | null>(null);

function readGuest(): CartInput[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(guestKey) ?? localStorage.getItem(legacyGuestKey) ?? '[]',
    );
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, 20)
      .filter(
        (i) =>
          i &&
          typeof i.sku === 'string' &&
          /^[A-Z0-9-]{1,80}$/.test(i.sku) &&
          Number.isInteger(i.quantity) &&
          i.quantity > 0 &&
          i.quantity <= 20,
      );
  } catch {
    return [];
  }
}
function saveGuest(items: CartInput[]) {
  try {
    localStorage.setItem(guestKey, JSON.stringify(items));
    localStorage.removeItem(legacyGuestKey);
  } catch {
    /* Cart still works in memory. */
  }
}
function guestCart(items: CartInput[], products: Product[]): Cart {
  const described = items.map((item) => {
    const product = products.find((p) => p.variants.some((v) => v.sku === item.sku));
    const variant = product?.variants.find((v) => v.sku === item.sku);
    return {
      ...item,
      name: product?.name,
      productSlug: product?.slug,
      weightGrams: variant?.weightGrams,
      unitPricePaise: variant?.pricePaise ?? null,
      lineTotalPaise: variant ? variant.pricePaise * item.quantity : null,
      available: !!variant?.inStock,
      issue: !variant ? 'PRODUCT_UNAVAILABLE' : !variant.inStock ? 'INSUFFICIENT_STOCK' : null,
    };
  });
  return {
    revision: 0,
    currency: 'INR',
    items: described,
    subtotalPaise: described.some((i) => i.lineTotalPaise === null)
      ? null
      : described.reduce((sum, i) => sum + i.lineTotalPaise!, 0),
    canCheckout: described.length > 0 && described.every((i) => i.available),
  };
}

export function StoreProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: { products: Product[]; categories: Category[]; error: string | null };
}) {
  const [products, setProducts] = useState(initial.products);
  const [categories, setCategories] = useState(initial.categories);
  const [catalogError, setCatalogError] = useState(initial.error);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const reloadCatalog = useCallback(async () => {
    try {
      const [first, c] = await Promise.all([
        apiEnvelope<Product[]>('products?limit=40'),
        api<Category[]>('categories'),
      ]);
      const p = await collectCatalog(first, (page) =>
        apiEnvelope<Product[]>(`products?limit=40&page=${page}`),
      );
      setProducts(p);
      setCategories(c);
      setCatalogError(null);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Could not load products.');
    }
  }, []);

  const catalogUnavailable = Boolean(catalogError);
  useEffect(() => {
    const delay = catalogRetryDelays[catalogRetry];
    if (!initial.error || !catalogUnavailable || delay === undefined) return;
    const timer = setTimeout(() => {
      void reloadCatalog().then(() => setCatalogRetry((attempt) => attempt + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [initial.error, catalogUnavailable, catalogRetry, reloadCatalog]);

  async function loadCustomerCart(profile: Customer) {
    setCustomer(profile);
    let saved = await api<Cart>('cart');
    const guest = readGuest();
    if (guest.length) {
      const merged = new Map(saved.items.map((i) => [i.sku, i.quantity]));
      for (const i of guest) merged.set(i.sku, Math.min(20, (merged.get(i.sku) ?? 0) + i.quantity));
      try {
        saved = await api<Cart>('cart', {
          method: 'PUT',
          body: JSON.stringify({
            revision: saved.revision,
            items: [...merged].slice(0, 20).map(([sku, quantity]) => ({ sku, quantity })),
          }),
        });
        saveGuest([]);
      } catch {
        notify('Signed in. Your saved cart is loaded; some guest items could not be merged.');
      }
    }
    setCart(saved);
  }
  useEffect(() => {
    let alive = true;
    const guest = readGuest();
    setCart(guestCart(guest, initial.products));
    void api<Customer>('auth/me')
      .then((profile) => {
        if (alive) return loadCustomerCart(profile);
      })
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401))
          notify('You can browse now. Sign-in is temporarily unavailable.');
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    const expired = () => {
      setCustomer(null);
      setCart(emptyCart);
      notify('Your session expired. Please sign in again.');
    };
    window.addEventListener('session-expired', expired);
    return () => {
      alive = false;
      window.removeEventListener('session-expired', expired);
    };
    // Session bootstrap runs once; catalog refresh must not re-merge guest items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready && !customer) setCart(guestCart(readGuest(), products));
  }, [products, ready, customer]);

  async function login(email: string, password: string) {
    const profile = await api<Customer>('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await loadCustomerCart(profile);
    setReady(true);
    notify(`Welcome back, ${profile.name.split(' ')[0]}.`);
  }
  async function logout(allDevices = false) {
    try {
      await api(allDevices ? 'auth/logout-all' : 'auth/logout', { method: 'POST' });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setCustomer(null);
    saveGuest([]);
    setCart(emptyCart);
    notify(allDevices ? 'You’re signed out on all devices.' : 'You’re signed out. See you soon!');
  }
  async function refreshCart() {
    if (customer) setCart(await api<Cart>('cart'));
    else setCart(guestCart(readGuest(), products));
  }
  async function mutate(sku: string, quantity: number, increment: boolean) {
    if (!ready || locked.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      const current = cart.items.find((i) => i.sku === sku)?.quantity ?? 0;
      const nextQuantity = increment ? current + quantity : quantity;
      if (nextQuantity > 20) throw new Error('You can add up to 20 packs of each size.');
      const items: CartInput[] = cart.items
        .map((i) => ({ sku: i.sku, quantity: i.sku === sku ? nextQuantity : i.quantity }))
        .filter((i) => i.quantity > 0);
      if (!current && nextQuantity > 0) items.push({ sku, quantity: nextQuantity });
      if (items.length > 20) throw new Error('Your cart can hold up to 20 different packs.');
      if (customer)
        setCart(
          await api<Cart>('cart', {
            method: 'PUT',
            body: JSON.stringify({ revision: cart.revision, items }),
          }),
        );
      else {
        saveGuest(items);
        setCart(guestCart(items, products));
      }
      if (increment) notify('A little goodness added to your bag.');
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CART_CONFLICT') {
        await refreshCart().catch(() => {});
        notify('Your bag changed in another tab. We’ve refreshed it; please try again.');
      } else notify(error instanceof Error ? error.message : 'Could not update your bag.');
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <StoreContext.Provider
      value={{
        products,
        categories,
        catalogError,
        reloadCatalog,
        customer,
        ready,
        cart,
        busy,
        notice,
        notify,
        login,
        logout,
        addItem: (sku, quantity = 1) => mutate(sku, quantity, true),
        setQuantity: (sku, quantity) => mutate(sku, quantity, false),
        refreshCart,
      }}
    >
      {children}
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </StoreContext.Provider>
  );
}
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider is required.');
  return store;
}
