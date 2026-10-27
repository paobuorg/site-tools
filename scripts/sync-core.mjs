import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { projectRoot } from './load-env.mjs';

const sourceDir = path.resolve(projectRoot, '..', 'site-www', 'core-dist');
const sourceLock = path.join(sourceDir, 'core.lock.json');
if (!fs.existsSync(sourceLock)) {
  throw new Error(`Missing ${sourceLock}. Run pnpm core:pack in site-www first.`);
}

const lock = JSON.parse(fs.readFileSync(sourceLock, 'utf8'));
const artifact = path.join(sourceDir, lock.artifact);
if (!fs.existsSync(artifact)) {
  throw new Error(`Missing core artifact ${artifact}. Run pnpm core:pack in site-www first.`);
}

const sha256 = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
if (sha256 !== lock.sha256) {
  throw new Error(`Core artifact hash mismatch: expected ${lock.sha256}, got ${sha256}`);
}

const vendorDir = path.join(projectRoot, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(artifact, path.join(vendorDir, 'paobu-core.tgz'));
fs.writeFileSync(
  path.join(projectRoot, 'core.lock.json'),
  `${JSON.stringify(
    {
      name: lock.name,
      version: lock.version,
      source: 'local-artifact',
      artifact: lock.artifact,
      sha256: lock.sha256,
      syncedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(`Synced ${lock.name}@${lock.version} (${lock.sha256.slice(0, 16)}…).`);
