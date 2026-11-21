import type { Product } from './types.ts';
type Page = { data: Product[]; pagination?: { totalPages: number } };
export async function collectCatalog(
  first: Page,
  loadPage: (page: number) => Promise<Page>,
): Promise<Product[]> {
  const pages = first.pagination?.totalPages ?? 1;
  if (!Number.isInteger(pages) || pages < 0 || pages > 1000)
    throw new Error('Invalid catalog pagination.');
  const products = [...first.data];
  // Small catalog today; bounded batches also include future added products.
  for (let page = 2; page <= pages; page += 3) {
    const results = await Promise.all(
      Array.from({ length: Math.min(3, pages - page + 1) }, (_, i) => loadPage(page + i)),
    );
    for (const result of results) products.push(...result.data);
  }
  return [...new Map(products.map((p) => [p.id, p])).values()];
}
