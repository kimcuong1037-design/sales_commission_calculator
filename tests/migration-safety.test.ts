import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

void test('the historical cleanup migration cannot delete production data', () => {
  const sql = readFileSync(
    new URL('../drizzle/0001_clear_test_data.sql', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+[`"]?(contracts|installments)/i);
});
