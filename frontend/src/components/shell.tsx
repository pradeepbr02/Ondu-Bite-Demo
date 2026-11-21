'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Flower2,
  Menu,
  Search,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import { useStore } from './store-provider';
import { StoreAssistant } from './store-assistant';
import { BagPreview } from './bag-preview';
import { RotatingSearchInput } from './rotating-search-input';

export function Brand({
  light = false,
  replayOnHover = false,
}: {
  light?: boolean;
  replayOnHover?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`brand ${light ? 'brand-light' : ''}`}
      aria-label="Ondu Packet home"
      onPointerEnter={(event) => {
        if (!replayOnHover || event.pointerType !== 'mouse') return;
        for (const animation of event.currentTarget.getAnimations({ subtree: true })) {
          animation.currentTime = 0;
          animation.play();
        }
      }}
    >
      <span className="brand-wordmark" aria-hidden="true">
        <span className="brand-ondu">
          o<span className="brand-highlight">n</span>du
        </span>
        <span className="brand-packet">packet</span>
      </span>
    </Link>
  );
}
export function Shell({
  children,
  whatsappNumber,
}: {
  children: ReactNode;
  whatsappNumber?: string;
}) {
  const { customer, categories } = useStore();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchPanel = useRef<HTMLDivElement>(null);
  const mobileSearchButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const path = usePathname();
  const close = () => {
    setMenu(false);
    setMobileSearchOpen(false);
  };
  useEffect(() => {
    if (mobileSearchOpen)
      mobileSearchPanel.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [mobileSearchOpen]);
  if (path === '/admin' || path.startsWith('/admin/')) return <>{children}</>;
  const searchForm = (
    <form
      className="header-search store-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        close();
        const query = search.trim();
        router.push(query ? `/shop?q=${encodeURIComponent(query)}` : '/shop');
      }}
    >
      <RotatingSearchInput label="Search the pantry" value={search} onChange={setSearch} />
      <button type="submit" aria-label="Search">
        <Search size={19} aria-hidden="true" />
      </button>
    </form>
  );
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="announcement">
        <span>A little goodness goes a long way.</span>
        <span>
          <Truck size={15} /> Free shipping on orders ₹999+ <ArrowRight size={14} />
        </span>
        <span>Made for your everyday</span>
      </div>
      <header className="header">
        <div className="container header-inner">
          <button
            className="icon-button mobile-menu-button"
            aria-label={menu ? 'Close menu' : 'Open menu'}
            aria-expanded={menu}
            onClick={() => {
              setMobileSearchOpen(false);
              setMenu(!menu);
            }}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <Brand replayOnHover />
          <nav className="desktop-nav" aria-label="Main navigation">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?category=${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </nav>
          {searchForm}
          <div className="header-actions">
            <button
              ref={mobileSearchButton}
              className="icon-button mobile-search-toggle"
              type="button"
              aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
              aria-expanded={mobileSearchOpen}
              aria-controls={mobileSearchOpen ? 'mobile-search-panel' : undefined}
              onClick={() => {
                setMenu(false);
                setMobileSearchOpen(!mobileSearchOpen);
              }}
            >
              {mobileSearchOpen ? <X size={20} /> : <Search size={20} />}
            </button>
            <Link
              className="icon-button"
              href="/account"
              aria-label={customer ? 'My account' : 'Sign in'}
              onClick={close}
            >
              <UserRound size={22} />
            </Link>
            <BagPreview whatsappNumber={whatsappNumber} onOpen={close} />
          </div>
        </div>
        {mobileSearchOpen && (
          <div
            id="mobile-search-panel"
            className="container mobile-search-panel"
            ref={mobileSearchPanel}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              setMobileSearchOpen(false);
              mobileSearchButton.current?.focus();
            }}
          >
            {searchForm}
          </div>
        )}
        {menu && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <Link onClick={close} href="/shop">
              Shop all <ArrowUpRight size={18} />
            </Link>
            {categories.map((c) => (
              <Link key={c.id} onClick={close} href={`/shop?category=${c.slug}`}>
                {c.name}
                <span lang="kn" className="kannada">
                  {c.kannadaName}
                </span>
              </Link>
            ))}
            <Link onClick={close} href="/orders">
              Your orders
            </Link>
            <Link onClick={close} href="/about">
              Our story
            </Link>
            <Link onClick={close} href="/faq">
              A little help
            </Link>
          </nav>
        )}
      </header>
      <main id="main">{children}</main>
      <section className="closing-strip">
        <Flower2 />
        <span>
          Good food. Good mood.{' '}
          <em>
            <span className="kannada" lang="kn">
              ನಮ್ಮ
            </span>{' '}
            Ondu Packet.
          </em>
        </span>
        <Flower2 />
      </section>
      <footer>
        <div className="container footer-grid">
          <div>
            <Brand light />
            <p>
              Little pantry pleasures,
              <br />
              for the everyday and the just-because.
            </p>
            <span className="footer-note">A store in the making. A whole lot of goodness.</span>
          </div>
          <div>
            <h3>Fill your pantry</h3>
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?category=${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <h3>Here to help</h3>
            <Link href="/account">Your account</Link>
            <Link href="/orders">Your orders</Link>
            <Link href="/faq">Shipping & FAQs</Link>
            <Link href="/about">Our story</Link>
            <Link href="/photo-credits">Photo credits</Link>
          </div>
          <div className="footer-promise">
            <Flower2 size={34} />
            <h3>
              A little pause.
              <br />A lovely bite.
            </h3>
            <p>Discover your next favourite, one pack at a time.</p>
            <Link href="/shop">
              Explore the pantry <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Ondu Packet. A little goodness, every day.</span>
          <span>
            India · INR ₹ <Check size={13} />
          </span>
        </div>
      </footer>
      <StoreAssistant whatsappNumber={whatsappNumber} />
    </>
  );
}
