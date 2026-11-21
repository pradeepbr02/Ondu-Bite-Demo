import type { Category, Product } from './types';

export const shopSortOptions = [
  { value: 'featured', label: 'Pantry order' },
  { value: 'category', label: 'Category: A–Z' },
  { value: 'category-desc', label: 'Category: Z–A' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A–Z' },
  { value: 'name-desc', label: 'Name: Z–A' },
  { value: 'available', label: 'In stock first' },
] as const;

export function selectShopProducts(
  products: Product[],
  categories: Category[],
  category: string,
  query: string,
  sort: string,
) {
  const text = query.trim().toLocaleLowerCase();
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const selected = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!text || `${p.name} ${p.kannadaName ?? ''}`.toLocaleLowerCase().includes(text)),
  );
  const compareName = (a: Product, b: Product) => a.name.localeCompare(b.name, 'en-IN');
  if (sort === 'category' || sort === 'category-desc')
    selected.sort(
      (a, b) =>
        (names.get(a.category) ?? a.category).localeCompare(
          names.get(b.category) ?? b.category,
          'en-IN',
        ) * (sort === 'category-desc' ? -1 : 1) || compareName(a, b),
    );
  else if (sort === 'price-asc' || sort === 'price-desc')
    selected.sort(
      (a, b) =>
        ((a.variants[0]?.pricePaise ?? Infinity) - (b.variants[0]?.pricePaise ?? Infinity)) *
          (sort === 'price-desc' ? -1 : 1) || compareName(a, b),
    );
  else if (sort === 'name-asc' || sort === 'name-desc')
    selected.sort((a, b) => compareName(a, b) * (sort === 'name-desc' ? -1 : 1));
  else if (sort === 'available')
    selected.sort(
      (a, b) =>
        Number(b.variants.some((v) => v.inStock)) - Number(a.variants.some((v) => v.inStock)),
    );
  return selected;
}
