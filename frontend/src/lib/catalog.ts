import type { Category, Product } from './types';
import { collectCatalog } from './catalog-pages';
export async function loadCatalog(): Promise<{
  products: Product[];
  categories: Category[];
  error: string | null;
}> {
  const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';
  try {
    const responses = await Promise.all([
      fetch(`${base}/api/v1/products?limit=40`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(7000),
      }),
      fetch(`${base}/api/v1/categories`, { cache: 'no-store', signal: AbortSignal.timeout(7000) }),
    ]);
    if (responses.some((r) => !r.ok)) throw new Error('Unavailable');
    const [products, categories] = await Promise.all(responses.map((r) => r.json()));
    const allProducts = await collectCatalog(products, async (page) => {
      const response = await fetch(`${base}/api/v1/products?limit=40&page=${page}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error('Catalog unavailable');
      return response.json();
    });
    return { products: allProducts, categories: categories.data, error: null };
  } catch {
    return {
      products: [],
      categories: [],
      error: 'Our pantry is taking a moment to load. Please try again.',
    };
  }
}
