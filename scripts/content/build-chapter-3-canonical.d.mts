export type Chapter3CanonicalManifest = Readonly<{
  chapter: 'chapter-3';
  content_counts: Readonly<Record<string, number>>;
  format_version: 1;
  media: readonly Readonly<{
    alt_text: string;
    bytes: number;
    height: number;
    owner_code: string;
    package_path: string;
    semantic_role: 'color_critical';
    sha256: string;
    sort_order: number;
    source_path: string;
    width: number;
  }>[];
  package_authority: 'content.xlsx';
  source: Readonly<{
    kind: 'google_sheet_xlsx_export';
    sha256: string;
  }>;
  unresolved_errors: 0;
  unresolved_warnings: 0;
  workbook_sha256: string;
}>;

export function buildChapter3CanonicalPackage(
  input: Readonly<{
    sourcePath: string;
    zipPath?: string;
  }>,
): Readonly<{
  manifest: Chapter3CanonicalManifest;
  workbookPath: string;
  zipPath?: string;
}>;
