'use client';
import { useState } from 'react';
import { Flower2 } from 'lucide-react';
import { categorySlugs, type Product } from '@/lib/types';
import { useStore } from './store-provider';
import { useNearViewport } from './use-near-viewport';

export function FoodVisual({
  category,
  image,
  className = '',
  alt = '',
  priority = false,
  presentation,
}: {
  category: string;
  image?: string;
  className?: string;
  alt?: string;
  priority?: boolean;
  presentation?: Product['imagePresentation'];
}) {
  const { ref, visible } = useNearViewport<HTMLDivElement>(priority);
  const [failedSource, setFailedSource] = useState('');
  const { categories, products } = useStore();
  const index = Math.max(0, categorySlugs.indexOf(category));
  const source =
    image ||
    categories.find((c) => c.slug === category)?.image ||
    products.find((p) => p.category === category && p.images.length)?.images[0];
  const product = products.find((p) => p.images[0] === source);
  const layout =
    presentation ??
    product?.imagePresentation ??
    categories.find((c) => c.image === source)?.imagePresentation;
  const layoutClass =
    layout === 'package' ? 'package-photo' : layout === 'package-scene' ? 'package-scene' : '';
  return (
    <div
      ref={ref}
      data-category={category}
      className={`food-visual food-${index} ${layoutClass} ${className}`}
      aria-busy={!!source && !visible}
    >
      {source && visible && failedSource !== source ? (
        <img
          src={source}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailedSource(source)}
        />
      ) : (
        <Flower2 className="food-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
