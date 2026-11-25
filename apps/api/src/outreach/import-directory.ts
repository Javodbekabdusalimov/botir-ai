// Imports a JSON array of non-partner businesses. Idempotent (key name+address), create-only, rejects entries without sources.
// Run: pnpm --filter api exec tsx src/outreach/import-directory.ts [path]   (default: prisma/directory.json)
// Seed calls importDirectoryFile() with the same file.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { importDirectory, type DirectoryStore, type ImportReport } from './directory';

export const DEFAULT_DIRECTORY = join(__dirname, '..', '..', 'prisma', 'directory.json');

export const prismaDirectoryStore = (db: PrismaClient): DirectoryStore => ({
  has: async (dedupeKey) => (await db.externalBusiness.count({ where: { dedupeKey } })) > 0,
  create: async (row) => {
    await db.externalBusiness.create({
      data: { ...row, contacts: JSON.stringify(row.contacts), sources: JSON.stringify(row.sources) },
    });
  },
});

export async function importDirectoryFile(db: PrismaClient, path: string = DEFAULT_DIRECTORY): Promise<ImportReport> {
  return importDirectory(prismaDirectoryStore(db), JSON.parse(await readFile(path, 'utf8')) as unknown);
}

if (require.main === module) {
  const db = new PrismaClient();
  importDirectoryFile(db, process.argv[2])
    .then((r) => {
      process.stdout.write(`directory: created ${r.created}, skipped ${r.skipped}, rejected ${r.rejected.length}\n${r.rejected.map((x) => `  - ${x}\n`).join('')}`);
    })
    .catch((e: unknown) => {
      process.stderr.write(`import failed: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
