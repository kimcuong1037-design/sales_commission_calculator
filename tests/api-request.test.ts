import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApiRequestError,
  readJsonRequest,
} from '../lib/api-request.ts';

void test('rejects unsupported request content types', async () => {
  await assert.rejects(
    readJsonRequest(
      new Request('https://example.com/api', {
        method: 'POST',
        body: 'plain text',
      }),
    ),
    (error) => error instanceof ApiRequestError && error.status === 415,
  );
});

void test('rejects malformed JSON as a client error', async () => {
  await assert.rejects(
    readJsonRequest(
      new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    ),
    (error) => error instanceof ApiRequestError && error.status === 400,
  );
});
