import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type PackageManifest = Readonly<{
  scripts?: Readonly<Record<string, string>>;
}>;

const readProjectFile = (path: string) => readFileSync(path, 'utf8');

describe('Vitest suite boundaries', () => {
  it('keeps real-stack integration tests out of unit and coverage runs', () => {
    const packageManifest = JSON.parse(
      readProjectFile('package.json'),
    ) as PackageManifest;
    const unitConfig = readProjectFile('vitest.config.ts');

    expect(packageManifest.scripts?.test).toBe('vitest run');
    expect(packageManifest.scripts?.['test:coverage']).toBe(
      'vitest run --coverage',
    );
    expect(unitConfig).toContain("'tests/integration/**'");
    expect(unitConfig).toContain("'**/*.integration.test.*'");
  });

  it('owns real-stack tests through one explicit Node integration command', () => {
    const packageManifest = JSON.parse(
      readProjectFile('package.json'),
    ) as PackageManifest;
    const integrationConfigPath = 'vitest.integration.config.ts';

    expect(packageManifest.scripts?.['test:integration']).toBe(
      'vitest run --config vitest.integration.config.ts',
    );
    expect(existsSync(integrationConfigPath)).toBe(true);

    if (!existsSync(integrationConfigPath)) return;

    const integrationConfig = readProjectFile(integrationConfigPath);
    const nodeTypeScriptProject = readProjectFile('tsconfig.node.json');

    expect(integrationConfig).toContain("environment: 'node'");
    expect(integrationConfig).toContain("'tests/integration/**/*.test.ts'");
    expect(integrationConfig).toContain("'src/**/*.integration.test.{ts,tsx}'");
    expect(nodeTypeScriptProject).toContain('"vitest.integration.config.ts"');
    expect(nodeTypeScriptProject).toContain('"scripts/**/*.ts"');
    expect(nodeTypeScriptProject).toContain('"tests/fixtures/**/*.ts"');
  });
});
