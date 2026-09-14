import assert from 'node:assert/strict';
import test from 'node:test';

import { getApiErrorMessage, readApiJson } from '../lib/api-response.ts';

void test('uses a structured API error when one is returned', async () => {
  const response = Response.json(
    { error: '合同编号已存在，请核对后重试' },
    { status: 409 },
  );

  assert.equal(
    await getApiErrorMessage(response, '合同保存失败'),
    '合同编号已存在，请核对后重试',
  );
});

void test('explains an access-layer HTML response instead of reporting a ledger outage', async () => {
  const response = new Response('<!doctype html><title>Forbidden</title>', {
    status: 403,
    headers: { 'content-type': 'text/html' },
  });

  assert.equal(
    await getApiErrorMessage(response, '合同保存失败'),
    '当前登录状态已失效或账号暂无写入权限，请刷新页面并重新登录后再试',
  );
});

void test('returns null for a non-JSON response', async () => {
  const response = new Response('<!doctype html>');
  assert.equal(await readApiJson(response), null);
});
