'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { Category, Product } from '@/lib/types';
import { ProductCard } from './product-card';

const batchSize = 8;
export function LazyProductGrid({
  products,
  categories,
  grouped,
}: {
  products: Product[];
  categories: Category[];
  grouped: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinel = useRef<HTMLDivElement>(null);
  const shown = products.slice(0, visibleCount);
  const hasMore = shown.length < products.length;
  useEffect(() => {
    if (!hasMore || !sentinel.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setVisibleCount((count) => Math.min(count + batchSize, products.length));
        }
      },
      { rootMargin: '180px 0px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, products.length]);
  return (
    <>
      <div className="product-grid shop-product-grid">
        {shown.map((product, index) => {
          const category = categories.find((c) => c.slug === product.category);
          const startGroup =
            grouped && (index === 0 || shown[index - 1]?.category !== product.category);
          return (
            <Fragment key={product.id}>
              {startGroup && (
                <div className="product-group-heading">
                  <h2>{category?.name ?? product.category}</h2>
                  {category?.kannadaName && (
                    <span className="kannada" lang="kn">
                      {category.kannadaName}
                    </span>
                  )}
                  <span>
                    {products.filter((p) => p.category === product.category).length}{' '}
                    {products.filter((p) => p.category === product.category).length === 1
                      ? 'product'
                      : 'products'}
                  </span>
                </div>
              )}
              <ProductCard product={product} />
            </Fragment>
          );
        })}
      </div>
      {products.length > 0 && (
        <div className="product-load-more" ref={sentinel}>
          <p role="status" aria-live="polite">
            Showing {shown.length} of {products.length} products
          </p>
          {hasMore && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setVisibleCount((count) => Math.min(count + batchSize, products.length))
              }
            >
              Load more products
            </button>
          )}
        </div>
      )}
    </>
  );
}
