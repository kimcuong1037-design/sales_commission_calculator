import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  AttachmentError,
  MAX_ATTACHMENT_BYTES,
  attachmentResponseHeaders,
  readAttachmentForm,
  validateAttachmentFile,
  validateAttachmentSignature,
} from '../lib/contract-attachments.ts';
import { emptyContract } from '../lib/contracts.ts';
import { createTestStorage } from './helpers/storage.ts';

const pdf = () =>
  new File(['%PDF-1.4\nlocal-test'], '测试合同.pdf', {
    type: 'application/pdf',
  });

void test('attachment migration is safe after runtime initialization and on repeated application', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const { storage } = await createTestStorage(sqlite);
    await storage.ensureDatabase();
    const sql = readFileSync(new URL('../drizzle/0003_contract_attachments.sql', import.meta.url), 'utf8');
    sqlite.exec(sql);
    sqlite.exec(sql);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM contract_attachments').get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('attachment validation rejects empty, oversized, unsupported and disguised files', () => {
  assert.throws(
    () => validateAttachmentFile({ name: 'empty.pdf', size: 0 }),
    /空文件/,
  );
  assert.throws(
    () =>
      validateAttachmentFile({
        name: 'big.pdf',
        size: MAX_ATTACHMENT_BYTES + 1,
      }),
    /10 MB/,
  );
  assert.throws(
    () => validateAttachmentFile({ name: 'script.html', size: 100 }),
    /只支持/,
  );
  assert.throws(
    () =>
      validateAttachmentSignature(
        new TextEncoder().encode('<html>'),
        'application/pdf',
      ),
    /内容与扩展名不符/,
  );
  assert.equal(
    validateAttachmentFile({ name: '合同.PDF', size: 10 }).contentType,
    'application/pdf',
  );
  validateAttachmentSignature(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg');
  validateAttachmentSignature(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/png',
  );
});

void test('multipart uploads are bounded even without a content-length header', async () => {
  const form = new FormData();
  form.set('contract_id', 'contract-1');
  form.set('file', pdf());
  const parsed = await readAttachmentForm(
    new Request('http://localhost/upload', { method: 'POST', body: form }),
  );
  assert.equal(parsed.get('contract_id'), 'contract-1');
  await assert.rejects(
    readAttachmentForm(
      new Request('http://localhost/upload', {
        method: 'POST',
        body: new Uint8Array(MAX_ATTACHMENT_BYTES + 65537),
        headers: { 'content-type': 'multipart/form-data; boundary=test' },
      }),
    ),
    /10 MB/,
  );
  await assert.rejects(
    readAttachmentForm(
      new Request('http://localhost/upload', {
        method: 'POST',
        body: 'bad',
        headers: { 'content-type': 'multipart/form-data; boundary=test' },
      }),
    ),
    /无法读取/,
  );
});

void test('attachments can be added after accrual without changing financial history; private download keeps original bytes', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const objects = new Map<string, ArrayBuffer>();
  const bucket = {
    async put(key: string, value: ArrayBuffer) {
      objects.set(key, value);
    },
    async get(key: string) {
      const value = objects.get(key);
      return value ? { body: new Response(value).body } : null;
    },
    async delete(keys: string | string[]) {
      for (const key of typeof keys === 'string' ? [keys] : keys)
        objects.delete(key);
    },
  };
  try {
    const { storage, attachments } = await createTestStorage(sqlite, {
      CONTRACT_FILES: bucket,
    });
    const id = await storage.createContract({
      ...emptyContract(),
      contract_number: 'FILE-1',
    });
    await storage.markCommissionAccrued({
      contract_id: id,
      record_id: `${id}:installment:1`,
      settlement_month: '2026-09',
      salesperson: '销售',
      commission_amount: 100,
    });
    const contractsBefore = await storage.listContracts();
    const historyBefore = await storage.listCommissionAccruals();
    const uploaded = await attachments.uploadContractAttachment(id, pdf());
    assert.deepEqual(await attachments.listContractAttachments(id), [uploaded]);
    assert.deepEqual(await storage.listContracts(), contractsBefore);
    assert.deepEqual(await storage.listCommissionAccruals(), historyBefore);
    const downloaded = await attachments.getContractAttachment(uploaded.id);
    assert.equal(
      await new Response(downloaded.body).text(),
      await pdf().text(),
    );
    const headers = attachmentResponseHeaders(uploaded, true);
    assert.match(
      headers['content-disposition'],
      /^attachment; filename\*=UTF-8''/,
    );
    assert.equal(headers['cache-control'], 'private, no-store');
    await assert.rejects(storage.deleteContract(id), /ACCRUED_CONTRACT/);
    assert.equal(objects.size, 1);
    await assert.rejects(
      attachments.uploadContractAttachment('missing', pdf()),
      (error: unknown) =>
        error instanceof AttachmentError && error.status === 404,
    );
    const other = await storage.createContract({
      ...emptyContract(),
      contract_number: 'FILE-2',
    });
    await attachments.uploadContractAttachment(other, pdf());
    await storage.deleteContract(other);
    assert.equal(objects.size, 1);
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM contract_attachments').get()?.n,
      1,
    );
  } finally {
    sqlite.close();
  }
});

void test('failed metadata write cleans up file and missing file storage is reported clearly', async () => {
  const sqlite = new DatabaseSync(':memory:');
  let objectCount = 0;
  try {
    const basic = await createTestStorage(sqlite);
    const id = await basic.storage.createContract({
      ...emptyContract(),
      contract_number: 'FAIL-1',
    });
    await assert.rejects(
      basic.attachments.uploadContractAttachment(id, pdf()),
      (error: unknown) =>
        error instanceof AttachmentError && error.status === 503,
    );
    const { attachments } = await createTestStorage(sqlite, {
      CONTRACT_FILES: {
        async put() {
          objectCount++;
          sqlite.prepare('DELETE FROM contracts WHERE id = ?').run(id);
        },
        async delete() {
          objectCount--;
        },
      },
    });
    await assert.rejects(
      attachments.uploadContractAttachment(id, pdf()),
      /FOREIGN KEY/,
    );
    assert.equal(objectCount, 0);
  } finally {
    sqlite.close();
  }
});
