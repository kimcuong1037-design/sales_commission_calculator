import { readFileSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import ts from 'typescript';

// Run the real storage SQL against SQLite, replacing only Cloudflare bindings
// and path aliases. All transformed modules stay in memory.
let moduleNumber = 0;
export async function createTestStorage(
  sqlite: DatabaseSync,
  bindings: Record<string, unknown> = {},
) {
  const prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    return {
      bind(...args: SQLInputValue[]) {
        values = args;
        return this;
      },
      first() {
        const row = sqlite.prepare(sql).get(...values);
        return row ? { ...row } : null;
      },
      all() {
        return {
          results: sqlite
            .prepare(sql)
            .all(...values)
            .map((row) => ({ ...row })),
        };
      },
      run() {
        return this.all();
      },
    };
  };
  const binding = {
    prepare,
    batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const key = `commission-storage-test-${moduleNumber++}`;
  Object.assign(globalThis, { [key]: { DB: binding, ...bindings } });
  function moduleUrl(path: string, overrides: Record<string, string> = {}) {
    const source = readFileSync(
      new URL(`../../${path}`, import.meta.url),
      'utf8',
    )
      .replace(
        "import { env } from 'cloudflare:workers';",
        `const env = globalThis[${JSON.stringify(key)}];`,
      )
      .replaceAll(/'@\/(.*?)'/g, (_, name: string) =>
        JSON.stringify(
          overrides[name] ?? new URL(`../../${name}.ts`, import.meta.url).href,
        ),
      );
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  }
  try {
    const storageUrl = moduleUrl('db/storage.ts');
    const storage = (await import(
      storageUrl
    )) as typeof import('../../db/storage.ts');
    const attachments = (await import(
      moduleUrl('db/attachments.ts', { 'db/storage': storageUrl })
    )) as typeof import('../../db/attachments.ts');
    return { storage, attachments };
  } finally {
    Reflect.deleteProperty(globalThis, key);
  }
}
