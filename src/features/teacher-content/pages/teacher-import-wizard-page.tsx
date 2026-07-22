import { useState } from 'react';

import type {
  ImportCommitReport,
  TeacherContentRepository,
} from '../api/teacher-content-repository';
import {
  buildTemplateWorkbook,
  type ParsedWorkbook,
  parseContentWorkbook,
} from '../api/xlsx-codec';
import { useCommitImport } from '../hooks/use-teacher-content';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function TeacherImportWizardPage({
  repository,
}: Readonly<{ repository?: TeacherContentRepository }>) {
  const commit = useCommitImport(repository);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [filename, setFilename] = useState('');
  const [report, setReport] = useState<ImportCommitReport | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateWorkbook()], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'colorplay-content-template.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file: File) => {
    setReport(null);
    setCommitError(null);
    setUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      setParsed(parseContentWorkbook(buffer));
      setFilename(file.name);
    } catch {
      setParsed(null);
      setUploadError('無法讀取這個檔案，請確認為 .xlsx 格式。');
    }
  };

  const importableRows = parsed
    ? parsed.questions.length + parsed.reviewCards.length
    : 0;
  const canCommit =
    parsed !== null &&
    parsed.errors.length === 0 &&
    importableRows > 0 &&
    !commit.isPending;

  const submit = () => {
    if (!parsed) return;
    setCommitError(null);
    commit.mutate(
      {
        dryRun: false,
        filename,
        questions: parsed.questions,
        requestId: crypto.randomUUID(),
        reviewCards: parsed.reviewCards,
      },
      {
        onError: (error) => {
          setCommitError(error.message);
        },
        onSuccess: (result) => {
          setReport(result);
        },
      },
    );
  };

  return (
    <section aria-labelledby="import-wizard-title" className="page-wide">
      <header>
        <p className="route-panel__eyebrow">教師功能</p>
        <h1 id="import-wizard-title">匯入內容</h1>
        <p>
          先下載範本，依照工作表欄位填入題庫與複習卡，再上傳預覽。伺服器會逐列
          重新驗證，全部通過才會一次寫入；任何錯誤都不會寫入部分內容。
        </p>
      </header>

      <section aria-label="步驟一：下載範本">
        <h2>步驟一：下載範本</h2>
        <button onClick={downloadTemplate} type="button">
          下載範本
        </button>
      </section>

      <section aria-label="步驟二：上傳檔案">
        <h2>步驟二：上傳檔案</h2>
        <label htmlFor="import-file">選擇試算表檔案</label>
        <input
          accept=".xlsx"
          id="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
          type="file"
        />
        {uploadError ? <p role="alert">{uploadError}</p> : null}
      </section>

      {parsed ? (
        <section aria-label="步驟三：預覽與匯入">
          <h2>步驟三：預覽與匯入</h2>
          <dl className="import-preview-counts">
            <div>
              <dt>總列數</dt>
              <dd>{parsed.totalRows}</dd>
            </div>
            <div>
              <dt>可匯入列數</dt>
              <dd>{importableRows}</dd>
            </div>
            <div>
              <dt>錯誤數</dt>
              <dd>{parsed.errors.length}</dd>
            </div>
          </dl>

          {parsed.errors.length > 0 ? (
            <>
              <p role="alert">請修正錯誤後重新上傳，匯入已被封鎖。</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">工作表</th>
                    <th scope="col">列</th>
                    <th scope="col">欄位</th>
                    <th scope="col">錯誤代碼</th>
                    <th scope="col">訊息</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.errors.map((error) => (
                    <tr
                      key={`${error.sheet}-${String(error.row)}-${error.code}-${error.field}`}
                    >
                      <td>{error.sheet}</td>
                      <td>{error.row}</td>
                      <td>{error.field}</td>
                      <td>{error.code}</td>
                      <td>{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {parsed.questions.length > 0 ? (
            <table aria-label="題目預覽">
              <thead>
                <tr>
                  <th scope="col">題號</th>
                  <th scope="col">題目</th>
                  <th scope="col">正解</th>
                </tr>
              </thead>
              <tbody>
                {parsed.questions.slice(0, 20).map((row) => (
                  <tr key={row.code}>
                    <td>{row.code}</td>
                    <td>{row.prompt}</td>
                    <td>{row.answerKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {parsed.reviewCards.length > 0 ? (
            <table aria-label="複習卡預覽">
              <thead>
                <tr>
                  <th scope="col">章節</th>
                  <th scope="col">標題</th>
                </tr>
              </thead>
              <tbody>
                {parsed.reviewCards.slice(0, 20).map((row) => (
                  <tr key={`${row.chapter}-${String(row.row)}`}>
                    <td>{row.chapter}</td>
                    <td>{row.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <button disabled={!canCommit} onClick={submit} type="button">
            送出匯入
          </button>
          {commit.isPending ? <p role="status">匯入處理中…</p> : null}
          {commitError ? <p role="alert">{commitError}</p> : null}
        </section>
      ) : null}

      {report ? (
        <section aria-label="匯入結果">
          <h2>匯入結果</h2>
          {report.status === 'committed' ? (
            <p role="status">
              {report.replayed
                ? '此請求已處理過，以下為原始報告。'
                : '匯入完成。'}
            </p>
          ) : (
            <p role="alert">匯入失敗，內容未寫入。</p>
          )}
          <dl className="import-report-counts">
            <div>
              <dt>總列數</dt>
              <dd>{report.total_rows}</dd>
            </div>
            <div>
              <dt>成功列數</dt>
              <dd>{report.status === 'committed' ? report.valid_rows : 0}</dd>
            </div>
            <div>
              <dt>錯誤列數</dt>
              <dd>{report.error_rows}</dd>
            </div>
          </dl>
          {report.row_errors.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">工作表</th>
                  <th scope="col">列</th>
                  <th scope="col">欄位</th>
                  <th scope="col">錯誤代碼</th>
                  <th scope="col">訊息</th>
                </tr>
              </thead>
              <tbody>
                {report.row_errors.map((error) => (
                  <tr key={`${error.sheet}-${String(error.row)}-${error.code}`}>
                    <td>{error.sheet}</td>
                    <td>{error.row}</td>
                    <td>{error.field}</td>
                    <td>{error.code}</td>
                    <td>{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
