import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('api/logs', { recursive: true });

await build({
  entryPoints: {
    visits: 'src/server/entries/visits.ts',
    'logs/session': 'src/server/entries/session.ts',
    login: 'src/server/entries/login.ts',
    profiles: 'src/server/entries/profiles.ts',
    progress: 'src/server/entries/progress.ts',
    logout: 'src/server/entries/logout.ts',
  },
  outdir: 'api',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  legalComments: 'none',
});
