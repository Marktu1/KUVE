// Armazenamento simples em ficheiro JSON, com escrita atómica.
// Para produção com muitos restaurantes, trocar por Postgres/SQLite mantendo esta interface.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EMPTY = { restaurants: [], dishes: [], orders: [], aiJobs: [], stats: {}, workers: {}, plataforma: {}, sessoes: {} };

export function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'db.json');
  let db = structuredClone(EMPTY);
  if (fs.existsSync(file)) {
    db = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  }

  let pending = null;
  function save() {
    // agrupa várias alterações seguidas numa só escrita
    if (pending) return;
    pending = setImmediate(() => {
      pending = null;
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, file);
    });
  }

  function flush() {
    if (pending) { clearImmediate(pending); pending = null; }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  const id = (n = 10) => crypto.randomBytes(n).toString('base64url').slice(0, n);

  return { db, save, flush, id };
}

export function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'restaurante';
}
