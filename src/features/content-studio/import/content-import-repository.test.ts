import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import {
  ContentImportRepositoryError,
  type ContentImportTransport,
  createContentImportRepository,
} from './content-import-repository';

const requestId = '82000000-0000-4000-8000-000000000001';
const runId = '82000000-0000-4000-8000-000000000002';
const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const workbookFile = (): File => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { content: '內容', stable_code: 'RC31-01', title: '標題' },
    ]),
    'RC',
  );
  const output = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as unknown as ArrayBuffer;
  return new File([output], 'content.xlsx', { type: xlsxMime });
};

const transport = (): ContentImportTransport => ({
  begin: vi.fn().mockResolvedValue({
    action: 'begin',
    bucket: 'content-import-quarantine',
    expires_at: '2026-09-26T10:00:00.000Z',
    object_path: `${runId}/package.xlsx`,
    outcome: 'ok',
    run_id: runId,
    token: 'signed-token',
  }),
  commit: vi.fn().mockResolvedValue({
    action: 'commit',
    outcome: 'ok',
    replayed: false,
    request_id: requestId,
    results: [{ stable_code: 'RC31-01' }],
    run_id: runId,
  }),
  preview: vi.fn().mockResolvedValue({
    action: 'preview',
    create_count: 1,
    error_count: 0,
    items: [
      {
        disposition: 'create',
        entity_type: 'review_card',
        issues: [],
        row_number: 2,
        sheet: 'RC',
        stable_code: 'RC31-01',
        warnings: [],
      },
    ],
    no_op_count: 0,
    outcome: 'ok',
    run_id: runId,
    source_sha256: 'a'.repeat(64),
    update_count: 0,
    warning_count: 0,
  }),
  uploadSigned: vi.fn().mockResolvedValue(undefined),
});

describe('ContentImport repository', () => {
  it('prechecks XLSX then uses one trusted upload and preview run', async () => {
    const supplied = transport();
    const result = await createContentImportRepository(supplied).previewPackage(
      { file: workbookFile(), mediaManifestMap: {}, requestId },
    );
    expect(supplied.begin).toHaveBeenCalledOnce();
    expect(supplied.uploadSigned).toHaveBeenCalledOnce();
    expect(supplied.preview).toHaveBeenCalledWith({
      mediaManifestMap: {},
      requestId,
      runId,
    });
    expect(result.create_count).toBe(1);
  });

  it('commits only the exact preview run with explicit warning choice', async () => {
    const supplied = transport();
    await createContentImportRepository(supplied).commitDrafts({
      confirmWarnings: true,
      requestId,
      runId,
    });
    expect(supplied.commit).toHaveBeenCalledWith({
      confirmWarnings: true,
      requestId,
      runId,
    });
  });

  it('rejects unsupported packages before any network call', async () => {
    const supplied = transport();
    await expect(
      createContentImportRepository(supplied).previewPackage({
        file: new File(['x'], 'content.json', { type: 'application/json' }),
        mediaManifestMap: {},
        requestId,
      }),
    ).rejects.toBeInstanceOf(ContentImportRepositoryError);
    expect(supplied.begin).not.toHaveBeenCalled();
  });
});
