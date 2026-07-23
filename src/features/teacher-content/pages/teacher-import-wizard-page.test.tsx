import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TeacherContentRepository } from '../api/teacher-content-repository';
import {
  buildTemplateWorkbook,
  sheetOf,
  TEMPLATE_SHEETS,
} from '../api/xlsx-codec';
import { TeacherImportWizardPage } from './teacher-import-wizard-page';

const headerOf = (workbook: XLSX.WorkBook, sheetName: string): string[] => {
  const rows = XLSX.utils.sheet_to_json<string[]>(
    sheetOf(workbook, sheetName),
    { header: 1 },
  );
  return rows[0] ?? [];
};

const workbookWith = (
  questionRows: readonly (readonly string[])[],
): ArrayBuffer => {
  const template = XLSX.read(buildTemplateWorkbook(), { type: 'array' });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headerOf(template, TEMPLATE_SHEETS.chapters)]),
    TEMPLATE_SHEETS.chapters,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headerOf(template, TEMPLATE_SHEETS.reviewCards)]),
    TEMPLATE_SHEETS.reviewCards,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      headerOf(template, TEMPLATE_SHEETS.questions),
      ...questionRows.map((row) => [...row]),
    ]),
    TEMPLATE_SHEETS.questions,
  );
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
};

const validQuestionRow = [
  '3',
  '3-1 色彩三要素與色名的表示',
  '色彩的分類',
  '7-2-01',
  '單選',
  '匯入測試題目',
  '選項甲',
  '選項乙',
  '',
  '',
  'B',
  '匯入測試解析',
] as const;

const invalidQuestionRow = [
  '3',
  '3-1 色彩三要素與色名的表示',
  '色彩的分類',
  '7-2-02',
  '單選',
  '沒有正解的題目',
  '選項甲',
  '選項乙',
  '',
  '',
  'X',
  '解析',
] as const;

const committedReport = {
  error_rows: 0,
  import_id: '29900000-0000-0000-0000-000000000001',
  replayed: false,
  row_errors: [],
  status: 'committed',
  total_rows: 1,
  valid_rows: 1,
};

const repositoryOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): TeacherContentRepository =>
  ({
    commitImport: vi.fn().mockResolvedValue(committedReport),
    ...overrides,
  }) as unknown as TeacherContentRepository;

const renderPage = (repository: TeacherContentRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<TeacherImportWizardPage repository={repository} />, {
    wrapper,
  });
};

const uploadWorkbook = async (buffer: ArrayBuffer, name: string) => {
  const input = screen.getByLabelText('選擇試算表檔案');
  const file = new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await userEvent.upload(input, file);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TeacherImportWizardPage', () => {
  it('downloads the real xlsx template', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => 'blob:template',
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    renderPage(repositoryOf());

    await userEvent.click(screen.getByRole('button', { name: '下載範本' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.size).toBeGreaterThan(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');
  });

  it('previews per-row errors and blocks the commit', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    await uploadWorkbook(workbookWith([invalidQuestionRow]), 'invalid.xlsx');

    expect(
      await screen.findByText('正解需為 A–D 或 1–4，不可留空或其他值'),
    ).toBeInTheDocument();
    expect(screen.getByText('ANSWER_INVALID')).toBeInTheDocument();
    expect(
      screen.getByText('請修正錯誤後重新上傳，匯入已被封鎖。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送出匯入' })).toBeDisabled();
    expect((window as Window & { __xss?: unknown }).__xss).toBeUndefined();
  });

  it('commits a valid workbook and reports success', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    await uploadWorkbook(workbookWith([validQuestionRow]), 'upload.xlsx');

    expect(await screen.findByText('匯入測試題目')).toBeInTheDocument();
    const commitButton = screen.getByRole('button', { name: '送出匯入' });
    expect(commitButton).toBeEnabled();
    await userEvent.click(commitButton);

    await waitFor(() => {
      expect(repository.commitImport).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: false,
          filename: 'upload.xlsx',
          questions: [
            expect.objectContaining({ answerKey: 'B', code: '7-2-01' }),
          ],
          reviewCards: [],
        }),
      );
    });
    expect(await screen.findByText('匯入完成。')).toBeInTheDocument();
  });

  it('shows a failed commit without pretending anything was written', async () => {
    const repository = repositoryOf({
      commitImport: vi.fn().mockResolvedValue({
        ...committedReport,
        error_rows: 1,
        row_errors: [
          {
            code: 'COMMIT_FAILED',
            field: '',
            message: '匯入途中失敗，內容已回復原狀',
            row: 0,
            sheet: '題庫',
          },
        ],
        status: 'failed',
      }),
    });
    renderPage(repository);

    await uploadWorkbook(workbookWith([validQuestionRow]), 'upload.xlsx');
    await userEvent.click(
      await screen.findByRole('button', { name: '送出匯入' }),
    );

    expect(
      await screen.findByText('匯入失敗，內容未寫入。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('匯入途中失敗，內容已回復原狀'),
    ).toBeInTheDocument();
  });
});
