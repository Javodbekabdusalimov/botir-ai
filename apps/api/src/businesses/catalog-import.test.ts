// Run: pnpm exec tsx apps/api/src/businesses/catalog-import.test.ts  (pure, no DB)
import { strict as assert } from 'node:assert';
import { normalizeRows } from './catalog-import';

const price = (v: unknown): number | undefined => normalizeRows([{ name: 'Osh', price: v }]).rows[0]?.price;

// Usual price-list spellings → whole so'm (before: "45.000" → 45, "45 ming" → 45)
for (const v of ['45.000', '45 000', "45 000 so'm", '45,000', '45 ming', 45000]) assert.equal(price(v), 45000, String(v));
assert.equal(price('1,5 mln'), 1_500_000);
assert.equal(price(0), 0);

// Never a wrong price: ranges, negatives, decimals and values that do not fit the Int column are errors
for (const v of ['30-40', '-5000', '45,000.50', 3_000_000_000, '99999999999999', '', 'kelishiladi']) {
  assert.equal(price(v), undefined, String(v));
}

const many = normalizeRows(Array.from({ length: 120 }, () => ({ name: '', price: 'x' })));
assert.equal(many.result.skipped, 120);
assert.equal(many.result.errors.length, 50, 'error list is capped');

const headers = normalizeRows([{ Nomi: 'Choy', Narx: '5 000', Birlik: 'piyola' }]);
assert.deepEqual(headers.rows[0] && { name: headers.rows[0].name, price: headers.rows[0].price, unit: headers.rows[0].unit }, { name: 'Choy', price: 5000, unit: 'piyola' });

process.stdout.write('catalog-import.test: OK\n');
