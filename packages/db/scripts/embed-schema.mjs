/**
 * Generate packages/db/src/schema-embed.ts dari packages/db/src/schema.sql.
 *
 * Next.js membundel @nusaquant/db ke dalam server bundle tanpa menyertakan
 * file .sql — jadi skema harus ikut sebagai string, bukan dibaca dari disk
 * saat runtime. Jalankan: npm run embed-schema --workspace @nusaquant/db
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(root, '..', 'src', 'schema.sql');
const outPath = join(root, '..', 'src', 'schema-embed.ts');

const sql = readFileSync(sqlPath, 'utf8');
const content = `/**
 * JANGAN EDIT MANUAL — dibuat oleh scripts/embed-schema.mjs dari src/schema.sql.
 * Jalankan ulang: npm run embed-schema --workspace @nusaquant/db
 */
export const SCHEMA_SQL: string = ${JSON.stringify(sql)};
`;
writeFileSync(outPath, content);
console.log(`schema-embed.ts ditulis (${sql.length} karakter SQL).`);
