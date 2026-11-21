import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectShopProducts, shopSortOptions } from '../src/lib/shop-catalog.ts';
const categories = [
  { slug: 'ready-to-mix', name: 'Ready to mix' },
  { slug: 'snacks', name: 'Snacks' },
  { slug: 'coffee', name: 'Coffee' },
];
const item = (name, category, price, inStock = true, kannadaName = '') => ({
  id: name,
  name,
  category,
  kannadaName,
  variants: [{ pricePaise: price, inStock }],
});
const products = [
  item('Chakli', 'snacks', 30000),
  item('Rava Idli Mix', 'ready-to-mix', 25000),
  item('Filter Coffee', 'coffee', 50000, false),
  item('Gulab Jamun Mix', 'ready-to-mix', 20000),
  item('Nippat', 'snacks', 27000, true, 'ನಿಪ್ಪಟ್ಟು'),
];
test('category sorting groups products by displayed category names and preserves the input order', () => {
  const original = products.map((p) => p.name);
  assert.deepEqual(
    selectShopProducts(products, categories, '', '', 'category').map((p) => p.name),
    ['Filter Coffee', 'Gulab Jamun Mix', 'Rava Idli Mix', 'Chakli', 'Nippat'],
  );
  assert.deepEqual(
    selectShopProducts(products, categories, '', '', 'category-desc').map((p) => p.category),
    ['snacks', 'snacks', 'ready-to-mix', 'ready-to-mix', 'coffee'],
  );
  assert.deepEqual(
    products.map((p) => p.name),
    original,
  );
});
test('filters combine with name, price and availability sorting, including Kannada searches', () => {
  assert.deepEqual(
    selectShopProducts(products, categories, 'ready-to-mix', 'mix', 'price-desc').map(
      (p) => p.name,
    ),
    ['Rava Idli Mix', 'Gulab Jamun Mix'],
  );
  assert.deepEqual(
    selectShopProducts(products, categories, '', '', 'name-asc').map((p) => p.name),
    ['Chakli', 'Filter Coffee', 'Gulab Jamun Mix', 'Nippat', 'Rava Idli Mix'],
  );
  assert.equal(
    selectShopProducts(products, categories, '', '', 'available').at(-1).name,
    'Filter Coffee',
  );
  assert.deepEqual(
    selectShopProducts(products, categories, '', 'ನಿಪ್ಪಟ್ಟು', 'featured').map((p) => p.name),
    ['Nippat'],
  );
  assert.deepEqual(
    selectShopProducts(products, categories, 'removed-category', '', 'category'),
    [],
  );
  assert.equal(shopSortOptions.length, 8);
});
