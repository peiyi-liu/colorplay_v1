import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function resolveViteConfiguration() {
  vi.resetModules();
  const configurationExport = (await import('../../vite.config')).default;
  return typeof configurationExport === 'function'
    ? configurationExport({ command: 'build', mode: 'production' } as never)
    : configurationExport;
}

async function collectTextFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectTextFiles(path);
      return /\.(?:ts|tsx|yml|yaml)$/u.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Phase 0 public build environment', () => {
  it.each(['local', 'staging', 'production'] as const)(
    'compiles the allowed %s deployment environment as a JSON string constant',
    async (environment) => {
      vi.stubEnv('COLORPLAY_DEPLOYMENT_ENVIRONMENT', environment);

      const configuration = await resolveViteConfiguration();

      expect(configuration.define).toEqual({
        __COLORPLAY_DEPLOYMENT_ENVIRONMENT__: JSON.stringify(environment),
      });
    },
  );

  it('defaults to local and rejects an unknown deployment environment', async () => {
    vi.stubEnv('COLORPLAY_DEPLOYMENT_ENVIRONMENT', undefined);
    const localConfiguration = await resolveViteConfiguration();
    expect(localConfiguration.define).toEqual({
      __COLORPLAY_DEPLOYMENT_ENVIRONMENT__: '"local"',
    });

    vi.stubEnv('COLORPLAY_DEPLOYMENT_ENVIRONMENT', 'preview');
    await expect(resolveViteConfiguration()).rejects.toThrow(
      'COLORPLAY_DEPLOYMENT_ENVIRONMENT_INVALID',
    );
  });

  it('keeps browser runtime configuration limited to the two approved VITE names', async () => {
    const roots = [resolve('src'), resolve('.github/workflows')];
    const paths = (await Promise.all(roots.map(collectTextFiles))).flat();
    const texts = await Promise.all(
      paths.map((path) => readFile(path, 'utf8')),
    );
    const names = texts.flatMap((text) =>
      [...text.matchAll(/VITE_[A-Z0-9_]+/gu)].map(([name]) => name),
    );

    expect(new Set(names)).toEqual(
      new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']),
    );
  });
});
