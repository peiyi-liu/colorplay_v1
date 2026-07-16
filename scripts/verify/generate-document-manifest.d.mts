export interface DocumentManifestFile {
  path: string;
  sha256: string;
  size_bytes: number;
}

export interface DocumentManifest {
  acceptance_criteria: number;
  files: DocumentManifestFile[];
  generated_at: string;
  markdown_files: number;
  package_name: string;
  package_version: string;
  real_device_required_criteria: string[];
  total_bytes_before_manifest: number;
  ui_acceptance_criteria: number;
  unique_acceptance_criteria: number;
}

export function collectDocumentPaths(rootDirectory: string): Promise<string[]>;

export function buildDocumentManifest(options: {
  generatedAt: string;
  rootDirectory: string;
}): Promise<DocumentManifest>;
