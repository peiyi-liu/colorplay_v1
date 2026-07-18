export type ReviewCardImportRow = Readonly<{
  id: string;
  stableCode: string;
  identity: string;
  chapterCode: string;
  sectionKey: string;
  sectionLabel: string;
  groupLabel: string;
  title: string;
  content: string;
  sortOrder: number;
}>;

export type ReviewCardImportSkip = Readonly<{
  rowNumber: number;
  preview: string;
  reason: string;
}>;

export function buildReviewCardImport(
  options: Readonly<{
    csvText: string;
    fixes: Readonly<{
      chapterMap?: Readonly<Record<string, string>>;
      reviewCardMedia?: Readonly<
        Record<string, Readonly<{ asset: string; alt: string }>>
      >;
    }>;
    generatedAt?: string;
  }>,
): Readonly<{
  cards: readonly ReviewCardImportRow[];
  manifestTs: string;
  problems: readonly string[];
  reportMd: string;
  seedSql: string;
  skipped: readonly ReviewCardImportSkip[];
}>;
