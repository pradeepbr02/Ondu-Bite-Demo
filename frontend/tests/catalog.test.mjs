import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCatalog } from '../src/lib/catalog-pages.ts';
test('catalog includes later API pages when products are added beyond the original 40', async () => {
  const requested = [];
  const products = await collectCatalog(
    { data: [{ id: 'first' }], pagination: { totalPages: 3 } },
    async (page) => {
      requested.push(page);
      return { data: [{ id: `page-${page}` }, { id: 'first' }] };
    },
  );
  assert.deepEqual(requested, [2, 3]);
  assert.deepEqual(
    products.map((p) => p.id),
    ['first', 'page-2', 'page-3'],
  );
});
test('empty catalogs do not trigger extra requests', async () => {
  assert.deepEqual(
    await collectCatalog({ data: [], pagination: { totalPages: 0 } }, () => {
      throw new Error('Unexpected request');
    }),
    [],
  );
});
