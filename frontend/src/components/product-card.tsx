'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { categoryNames, categorySlugs, money, weight, type Product } from '@/lib/types';
import { useStore } from './store-provider';
import { FoodVisual } from './food-visual';

export function ProductCard({ product }: { product: Product; index?: number }) {
  const { addItem, ready, busy } = useStore();
  const [selected, setSelected] = useState(
    () => product.variants.find((v) => v.inStock)?.sku ?? product.variants[0]?.sku,
  );
  const variant =
    product.variants.find((v) => v.sku === selected) ??
    product.variants.find((v) => v.inStock) ??
    product.variants[0];
  return (
    <article className="product-card pantry-card">
      <Link
        href={`/products/${product.slug}`}
        className="product-image-link"
        aria-label={`View ${product.name}`}
      >
        <FoodVisual
          category={product.category}
          image={product.images[0]}
          presentation={product.images[0] ? product.imagePresentation : undefined}
        />
        {product.imageNote && <span className="reference-pack-note">{product.imageNote}</span>}
      </Link>
      <div className="product-info">
        <span className="eyebrow product-category">
          {categoryNames[categorySlugs.indexOf(product.category)] ?? product.category}
        </span>
        <h3>
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="product-caption">
          {product.kannadaName ? (
            <span className="kannada" lang="kn">
              {product.kannadaName}
            </span>
          ) : (
            'A little everyday goodness.'
          )}
        </p>
        <div className="card-price-row">
          <span className="card-price">
            {variant ? money(variant.pricePaise) : 'Unavailable'}
            <small> / pack</small>
          </span>
          <span className={`card-stock ${variant?.inStock ? 'available' : ''}`}>
            {variant?.inStock ? 'In stock' : 'Out of stock'}
          </span>
        </div>
        <div
          className="weight-options"
          role="group"
          aria-label={`Choose ${product.name} pack size`}
        >
          {product.variants.map((v) => (
            <button
              key={v.sku}
              type="button"
              aria-pressed={v.sku === variant?.sku}
              aria-label={`${weight(v.weightGrams)}${v.inStock ? '' : ', out of stock'}`}
              className={v.sku === variant?.sku ? 'selected' : ''}
              onClick={() => setSelected(v.sku)}
            >
              {weight(v.weightGrams)}
            </button>
          ))}
        </div>
        <button
          className="add-button"
          disabled={!ready || busy || !variant?.inStock}
          onClick={() => variant && void addItem(variant.sku)}
          aria-label={`Add ${product.name}, ${variant ? weight(variant.weightGrams) : ''} to bag`}
        >
          {!ready ? (
            'Getting ready…'
          ) : variant?.inStock ? (
            <>
              <ShoppingBag size={16} /> Add to bag
            </>
          ) : (
            'Sold out'
          )}
        </button>
      </div>
    </article>
  );
}
