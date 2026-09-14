import assert from 'node:assert/strict';
import test from 'node:test';

import { requireAuthenticatedSiteUser } from '../lib/site-auth.ts';

void test('rejects an unauthenticated hosted API request', async () => {
  const response = requireAuthenticatedSiteUser(
    new Request('https://example.com/api/contracts'),
  );
  assert.equal(response?.status, 401);
  assert.deepEqual(await response?.json(), {
    error: '登录状态已失效，请刷新页面并重新登录',
  });
});

void test('accepts a signed-in Sites user and local development', () => {
  assert.equal(
    requireAuthenticatedSiteUser(
      new Request('https://example.com/api/contracts', {
        headers: {
          'oai-authenticated-user-email': 'finance@example.com',
        },
      }),
    ),
    null,
  );
  assert.equal(
    requireAuthenticatedSiteUser(
      new Request('http://localhost:3000/api/contracts'),
    ),
    null,
  );
});
