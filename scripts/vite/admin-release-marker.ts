import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';
export function adminReleaseMarkerPlugin(environment: string): Plugin {
  return {
    name: 'admin-release-marker',
    generateBundle() {
      const revision =
        process.env.GITHUB_SHA ??
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      if (!/^[a-f0-9]{40}$/.test(revision))
        throw new Error('RELEASE_REVISION_INVALID');
      this.emitFile({
        type: 'asset',
        fileName: 'admin-release.json',
        source: JSON.stringify({ environment, revision }),
      });
    },
  };
}
