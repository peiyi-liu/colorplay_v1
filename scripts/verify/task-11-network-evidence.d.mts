export type Task11NetworkEvidenceSummary = Readonly<{
  entryCount: number;
  schema: 'colorplay.auth.network.v1';
}>;

export declare function validateTask11NetworkEvidence(
  reportText: string,
): Task11NetworkEvidenceSummary;

export declare function validateTask11NetworkEvidenceFile(options: {
  readonly reportPath: string;
  readonly scanPath: string;
}): Promise<Task11NetworkEvidenceSummary>;
