'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Flower2,
  Leaf,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
} from 'lucide-react';
import { useStore } from './store-provider';
import { api } from '@/lib/api';
import { selectShopProducts, shopSortOptions } from '@/lib/shop-catalog';
import { FoodVisual } from './food-visual';
import { ProductCard } from './product-card';
import { CustomerReviews } from './customer-reviews';
import { RotatingSearchInput } from './rotating-search-input';
export { FoodVisual } from './food-visual';
export { ProductCard } from './product-card';
import { LazyProductGrid } from './lazy-product-grid';
import { categoryServingPhotos, mediaPath, servingPhotos } from '@/lib/media';
import { categorySlugs, money, weight, type Product } from '@/lib/types';

export function CatalogError() {
  const { catalogError, reloadCatalog } = useStore();
  if (!catalogError) return null;
  return (
    <div className="error-panel" role="alert">
      <p>{catalogError}</p>
      <button className="button secondary" onClick={() => void reloadCatalog()}>
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}

export function Home() {
  const { products, categories, catalogError } = useStore();
  const picks = categorySlugs
    .flatMap((category) => products.filter((p) => p.category === category).slice(0, 1))
    .slice(0, 4);
  return (
    <>
      <div className="breakfast-table">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="small-dash" />
              <span lang="kn" className="kannada">
                ನಮಸ್ಕಾರ
              </span>{' '}
              · From Karnataka
            </div>
            <h1>
              A taste of home.
              <br />
              <em lang="kn" className="hero-kannada kannada">
                ಮನೆಯ ರುಚಿ.
              </em>
            </h1>
            <p>
              Ready-to-eat favourites, filter coffee by the tumbler, and crisp chakli for later.
            </p>
            <div className="hero-buttons">
              <Link className="button primary" href="/shop">
                Shop the pantry <ArrowUpRight size={19} />
              </Link>
              <Link className="text-link" href="/about">
                Our story <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <Link className="hero-photo hero-collection" href="/shop">
            <Image
              src={mediaPath('hero')}
              alt="Ondu Packet packs arranged with filter coffee, chakli and gulab jamun"
              width={1408}
              height={768}
              priority
            />
            <div className="breakfast-caption">
              <span>
                <strong>Explore the pantry</strong>
                Packaging preview
              </span>
              <ArrowUpRight size={22} aria-hidden="true" />
            </div>
          </Link>
        </section>
      </div>
      <div className="promise-bar">
        <div className="container">
          <span>
            <Leaf size={19} /> Four delicious worlds to explore
          </span>
          <span>
            <ShoppingBag size={19} /> 250 g, 500 g & 1 kg packs
          </span>
          <span>
            <Truck size={20} /> Free shipping from ₹999
          </span>
        </div>
      </div>
      <div className="category-band">
        <section className="container section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span lang="kn" className="kannada">
                  ನಿಮ್ಮ ಮೆಚ್ಚಿನವು
                </span>{' '}
                · YOUR EVERYDAY FAVOURITES
              </div>
              <h2>What are you craving?</h2>
            </div>
            <Link href="/shop" className="text-link">
              Explore everything <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="category-grid">
            {categories.map((category) => (
              <Link
                href={`/shop?category=${category.slug}`}
                className="category-tile"
                key={category.id}
              >
                <FoodVisual
                  category={category.slug}
                  image={
                    category.imagePresentation === 'package-scene'
                      ? category.image
                      : (categoryServingPhotos[category.slug] ?? category.image)
                  }
                />
                <div>
                  <span>
                    <h3>{category.name}</h3>
                    {category.kannadaName && (
                      <span className="category-kannada kannada" lang="kn">
                        {category.kannadaName}
                      </span>
                    )}
                  </span>
                  <ArrowUpRight size={19} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="container section pantry-picks">
        <div className="section-heading">
          <div>
            <div className="eyebrow">YOUR NEXT “JUST ONE MORE”</div>
            <h2>Meet your pantry favourites.</h2>
          </div>
          <Link href="/shop" className="text-link">
            Shop all goodness <ArrowUpRight size={17} />
          </Link>
        </div>
        <CatalogError />
        <div className="product-grid">
          {picks.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
        {!catalogError && !products.length && (
          <p className="empty-copy">
            Our shelves are getting ready. Come back for a little goodness soon.
          </p>
        )}
      </section>
      <section className="container story-banner">
        <div className="story-photo">
          <Image
            src={servingPhotos.coffee}
            alt="Frothy filter coffee in a brass tumbler and dabara surrounded by coffee beans"
            fill
            sizes="(max-width: 760px) 100vw, 45vw"
          />
        </div>
        <div className="story-copy">
          <div className="eyebrow">SLOW DOWN. SIP A LITTLE.</div>
          <span className="story-kannada kannada" lang="kn">
            ಒಂದು ಕಾಫಿ?
          </span>
          <h2>
            One good cup.
            <br />
            <em>So many little joys.</em>
          </h2>
          <p>
            That first sip. A plate of chakli. A conversation that lasts a little longer. Our
            favourite everyday rituals deserve a place in your pantry.
          </p>
          <Link href="/shop?category=coffee" className="button secondary">
            Meet your morning coffee <ArrowUpRight size={18} />
          </Link>
        </div>
        <Flower2 className="story-flower" />
      </section>
      <CustomerReviews />
      <section className="container section mini-faq">
        <div>
          <div className="eyebrow">A LITTLE HELP</div>
          <h2>
            Good questions.
            <br />
            Simple answers.
          </h2>
          <Link href="/faq" className="text-link">
            All your questions <ArrowRight size={17} />
          </Link>
        </div>
        <div>
          <details>
            <summary>Can I choose my pack size?</summary>
            <p>
              Yes. Choose 250 g, 500 g or 1 kg on the product card or product page. Each size has
              its own availability.
            </p>
          </details>
          <details>
            <summary>How much is shipping?</summary>
            <p>Shipping is ₹59, and free when your item subtotal reaches ₹999.</p>
          </details>
          <details>
            <summary>Can I place a paid order yet?</summary>
            <p>
              We’re getting our store ready. You can explore the pantry and preview checkout.
              Payments and delivery bookings are not enabled yet.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}

export function Shop() {
  const { products, categories, catalogError } = useStore();
  const params = useSearchParams();
  const category = params.get('category') ?? '';
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState('featured');
  useEffect(() => setQuery(params.get('q') ?? ''), [params]);
  const filtered = selectShopProducts(products, categories, category, query, sort);
  return (
    <section className="container section shop-page">
      <h1 className="sr-only">Shop</h1>
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>Shop</span>
      </div>
      <div className="shop-toolbar">
        <nav className="category-tabs" aria-label="Filter categories">
          <Link className={!category ? 'selected' : ''} href="/shop">
            All goodness
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              className={category === c.slug ? 'selected' : ''}
              href={`/shop?category=${c.slug}`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="shop-controls">
          <label className="store-search shop-search">
            <Search size={17} aria-hidden="true" />
            <RotatingSearchInput label="Search products" value={query} onChange={setQuery} />
          </label>
          <label className="sort-control">
            <SlidersHorizontal size={16} />
            <span className="sr-only">Sort products</span>
            <select
              aria-label="Sort products"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {shopSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="results-count">
        {filtered.length} little reasons to smile <span>Sort prices use the smallest pack</span>
      </div>
      <CatalogError />
      <LazyProductGrid
        key={JSON.stringify([category, query, sort])}
        products={filtered}
        categories={categories}
        grouped={sort === 'category' || sort === 'category-desc'}
      />
      {!filtered.length && !catalogError && (
        <div className="empty-state">
          <Flower2 />
          <h2>No bites found.</h2>
          <p>Try another search or explore a different category.</p>
          <Link href="/shop" className="button primary" onClick={() => setQuery('')}>
            Explore all products
          </Link>
        </div>
      )}
    </section>
  );
}

function ProductPhotos({ product }: { product: Product }) {
  const [index, setIndex] = useState(0);
  const photos = product.images;
  const currentIndex = photos[index] ? index : 0;
  const photo = photos[currentIndex];
  const caption =
    photo && currentIndex === 0 && product.imageNote
      ? product.imageNote
      : photo
        ? product.name
        : 'Illustrative category image';

  return (
    <div
      className={`product-photos ${product.imagePresentation === 'package-scene' ? 'product-photos-wide' : ''}`}
    >
      <div className="detail-visual">
        <FoodVisual category={product.category} image={photo} alt={caption} priority />
        <span>{caption}</span>
      </div>
      {photos.length > 1 && (
        <div className="photo-options" role="group" aria-label={`Photos of ${product.name}`}>
          {photos.map((src, i) => (
            <button
              type="button"
              key={src}
              aria-label={`View photo ${i + 1} of ${product.name}`}
              aria-pressed={currentIndex === i}
              onClick={() => setIndex(i)}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductDetail({ slug }: { slug: string }) {
  const { products, ready, busy, addItem } = useStore();
  const fallback = products.find((p) => p.slug === slug);
  const [product, setProduct] = useState<Product | undefined>(fallback);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    let alive = true;
    void api<Product>(`products/${encodeURIComponent(slug)}`)
      .then((p) => {
        if (alive) setProduct(p);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  if (!product)
    return (
      <section className="container section">
        <div className="empty-state">
          <h1>{error ? 'This shelf is empty.' : 'Finding your favourite…'}</h1>
          <p>{error}</p>
          <Link href="/shop" className="button primary">
            Back to the pantry
          </Link>
        </div>
      </section>
    );
  const variant =
    product.variants.find((v) => v.sku === selected) ??
    product.variants.find((v) => v.inStock) ??
    product.variants[0];
  return (
    <section className="container section">
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href={`/shop?category=${product.category}`}>
          {product.category.replace('-', ' ')}
        </Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <div className="product-detail">
        <ProductPhotos key={product.id} product={product} />
        <div className="detail-copy">
          <div className="eyebrow">YOUR NEXT PANTRY FAVOURITE</div>
          <h1>{product.name}</h1>
          <p>A little bite of happiness, ready for your everyday moments.</p>
          <div className="detail-price">
            {variant ? money(variant.pricePaise) : 'Currently unavailable'}
          </div>
          <div className="field-label">Choose your pack</div>
          <div className="weight-options large">
            {product.variants.map((v) => (
              <button
                key={v.sku}
                className={variant?.sku === v.sku ? 'selected' : ''}
                onClick={() => setSelected(v.sku)}
                aria-pressed={variant?.sku === v.sku}
              >
                {weight(v.weightGrams)}
                {!v.inStock && <small>Sold out</small>}
              </button>
            ))}
          </div>
          <span className={`stock-label ${variant?.inStock ? '' : 'out'}`}>
            <span />
            {variant?.inStock ? 'Available in this pack size' : 'This pack is currently sold out'}
          </span>
          <div className="detail-add">
            <div className="quantity-control">
              <button
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
              >
                <Minus size={16} />
              </button>
              <span>{quantity}</span>
              <button
                aria-label="Increase quantity"
                disabled={quantity >= 20}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className="button primary"
              disabled={!ready || busy || !variant?.inStock}
              onClick={() => variant && void addItem(variant.sku, quantity)}
            >
              <ShoppingBag size={18} />{' '}
              {variant?.inStock
                ? `Add to bag · ${money(variant.pricePaise * quantity)}`
                : 'Sold out'}
            </button>
          </div>
          {(product.imagePresentation === 'package' ||
            product.imagePresentation === 'package-scene') && (
            <p className="packaging-reference-info">
              {product.imagePresentation === 'package-scene'
                ? 'Packaging preview. Use the pack size selected above. Printed weights and claims are illustrative.'
                : 'Reference packaging from another brand. Pack weights printed in the photo may differ from the demo sizes selected here.'}
            </p>
          )}
          <div className="detail-promises">
            <span>
              <Truck size={18} /> Free shipping from ₹999
            </span>
            <span>
              <Check size={18} /> Pick the size that suits you
            </span>
          </div>
          <details open>
            <summary>A little about this favourite</summary>
            <p>
              {product.description?.startsWith('Demo ')
                ? 'This is a preview from our growing pantry collection. Verified product details, ingredients and allergen information will be added before sales open.'
                : (product.description ?? 'Full product information is being prepared.')}
            </p>
          </details>
          <details>
            <summary>Ingredients & allergens</summary>
            <p>
              {product.ingredients?.length
                ? product.ingredients.join(', ')
                : 'Ingredient information is being prepared. Please check before purchasing when sales open.'}
            </p>
            <p>
              {product.allergens?.length
                ? `Allergens: ${product.allergens.join(', ')}`
                : 'Allergen information has not been verified yet.'}
            </p>
          </details>
        </div>
      </div>
      <div className="section-heading related-heading">
        <div>
          <div className="eyebrow">KEEP THE GOODNESS GOING</div>
          <h2>A few more little joys.</h2>
        </div>
        <Link className="text-link" href="/shop">
          Explore all <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="product-grid">
        {products
          .filter((p) => p.slug !== slug && p.category === product.category)
          .slice(0, 4)
          .map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
      </div>
    </section>
  );
}
