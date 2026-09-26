export function evaluateChapter3Readiness(
  input: Readonly<{
    database: unknown;
    packageManifest: unknown;
  }>,
): Readonly<{
  chapter: 'chapter-3';
  current_media_manifest_mappings: unknown;
  decision: 'PASS';
  migration_head: '20260926000800';
  package_media_count: 8;
  published_counts: unknown;
}>;

export function finalizeContentStudioChapter3(
  runDirectory: string,
): Promise<unknown>;
