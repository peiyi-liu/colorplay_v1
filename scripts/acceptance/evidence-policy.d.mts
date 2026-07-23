export function containsSensitiveValue(source: Buffer): boolean;

export function requireNonEmptyEvidence(
  paths: readonly string[],
): Promise<void>;

export function assertEvidenceSafe(
  input: Readonly<{
    evidencePaths: readonly string[];
    root: string;
    tracePaths: readonly string[];
  }>,
): Promise<void>;
