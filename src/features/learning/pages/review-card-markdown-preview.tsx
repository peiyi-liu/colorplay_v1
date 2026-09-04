import { useEffect, useMemo, useRef, useState } from 'react';

import { compileReviewCardMarkdown } from '../../../../scripts/content/review-card-markdown.mjs';
import { ReviewCardMarkdown } from '../components/review-card-markdown';

const sampleAltText = '十二色相環示意圖';
const sampleMarkdown = `# 色彩三屬性

**明度**代表色彩的明暗程度，可用來建立視覺層次。

> ==先比較最亮與最暗的位置==，再判斷資訊是否清楚。

![十二色相環示意圖](review-media:P301)

| 屬性 | 判讀重點 |
| --- | --- |
| 色相 | 顏色名稱與色相環位置 |
| 明度 | 亮暗差異 |
| 彩度 | 鮮豔或灰濁程度 |`;

type PreviewMediaMapping = Readonly<{
  altText: string;
  localUrl: string | null;
  reference: string;
}>;

const mappingAssetPath = (reference: string) =>
  `review-card-media/local-preview/${reference}`;

export function ReviewCardMarkdownPreview() {
  const localObjectUrlsRef = useRef(new Set<string>());
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [activeMobilePane, setActiveMobilePane] = useState<
    'editor' | 'preview'
  >('editor');
  const [mediaMappings, setMediaMappings] = useState<
    readonly PreviewMediaMapping[]
  >([
    {
      altText: sampleAltText,
      localUrl: null,
      reference: 'P301',
    },
  ]);
  useEffect(
    () => () => {
      for (const url of localObjectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );
  const mediaCatalog = useMemo(
    () =>
      Object.fromEntries(
        mediaMappings
          .filter(
            (mapping) =>
              mapping.reference.trim() !== '' && mapping.altText.trim() !== '',
          )
          .map((mapping) => [
            mapping.reference.trim(),
            {
              altText: mapping.altText.trim(),
              assetPath: mappingAssetPath(mapping.reference.trim()),
            },
          ]),
      ),
    [mediaMappings],
  );
  const compiled = useMemo(
    () => compileReviewCardMarkdown(markdown, mediaCatalog),
    [markdown, mediaCatalog],
  );
  const resolveImage = (source: string) => {
    const mapping = mediaMappings.find(
      (item) => mappingAssetPath(item.reference.trim()) === source,
    );
    const sampleUrl =
      mapping?.reference === 'P301' && mapping.altText === sampleAltText
        ? '/media/review/color-wheel.svg'
        : null;
    return {
      loading: false,
      resolvedUrl: mapping?.localUrl ?? sampleUrl,
    };
  };
  const updateMapping = (
    index: number,
    update: Partial<PreviewMediaMapping>,
  ) => {
    setMediaMappings((current) =>
      current.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...update } : mapping,
      ),
    );
  };

  return (
    <main className="review-markdown-preview">
      <header className="review-markdown-preview__header">
        <div>
          <p className="review-markdown-preview__eyebrow">LOCAL TOOL</p>
          <h1>複習卡 Markdown 即時預覽</h1>
          <p>
            貼上 Google Sheet
            欄位內容；此頁使用與學生閱讀頁相同的解析器，不會寫入資料庫。
          </p>
        </div>
        <p className="review-markdown-preview__status">僅限本機 · 不會儲存</p>
      </header>

      <nav
        aria-label="手機版預覽切換"
        className="review-markdown-preview__tabs"
      >
        <button
          aria-pressed={activeMobilePane === 'editor'}
          onClick={() => {
            setActiveMobilePane('editor');
          }}
          type="button"
        >
          編輯
        </button>
        <button
          aria-pressed={activeMobilePane === 'preview'}
          onClick={() => {
            setActiveMobilePane('preview');
          }}
          type="button"
        >
          預覽
        </button>
      </nav>

      <div className="review-markdown-preview__workspace">
        <section
          className="review-markdown-preview__editor"
          data-mobile-active={activeMobilePane === 'editor'}
        >
          <div className="review-markdown-preview__section-heading">
            <h2>Markdown 內容</h2>
            <span>{markdown.length} 字元</span>
          </div>
          <label className="review-markdown-preview__editor-field">
            <span>複習卡 Markdown</span>
            <textarea
              autoCapitalize="off"
              aria-describedby={
                compiled.errors.length > 0
                  ? 'review-markdown-preview-errors'
                  : undefined
              }
              aria-invalid={compiled.errors.length > 0}
              id="review-card-markdown"
              name="review-card-markdown"
              onChange={(event) => {
                setMarkdown(event.currentTarget.value);
              }}
              spellCheck={false}
              value={markdown}
            />
          </label>

          <section className="review-markdown-preview__media-panel">
            <div className="review-markdown-preview__section-heading">
              <div>
                <h2>圖片對照</h2>
                <p>Markdown 使用 review-media:代號；本機檔案只供預覽。</p>
                <p>
                  P301 是本頁內建示範，不代表正式 import-fixes 已有媒體
                  mapping。
                </p>
                <p id="review-markdown-preview-media-limit">
                  每張複習卡最多 3 張圖片。
                </p>
              </div>
              <button
                aria-describedby="review-markdown-preview-media-limit"
                disabled={mediaMappings.length >= 3}
                onClick={() => {
                  setMediaMappings((current) => [
                    ...current,
                    {
                      altText: '',
                      localUrl: null,
                      reference: `IMAGE${String(current.length + 1)}`,
                    },
                  ]);
                }}
                type="button"
              >
                {mediaMappings.length >= 3 ? '已達 3 張上限' : '新增圖片'}
              </button>
            </div>
            {mediaMappings.map((mapping, index) => (
              <fieldset
                className="review-markdown-preview__media-row"
                key={String(index)}
              >
                <legend>圖片 {index + 1}</legend>
                <label>
                  <span>代號</span>
                  <input
                    id={`review-media-reference-${String(index)}`}
                    name={`review-media-reference-${String(index)}`}
                    onChange={(event) => {
                      updateMapping(index, {
                        reference: event.currentTarget.value,
                      });
                    }}
                    value={mapping.reference}
                  />
                </label>
                <label>
                  <span>替代文字</span>
                  <input
                    id={`review-media-alt-${String(index)}`}
                    name={`review-media-alt-${String(index)}`}
                    onChange={(event) => {
                      updateMapping(index, {
                        altText: event.currentTarget.value,
                      });
                    }}
                    value={mapping.altText}
                  />
                </label>
                <label>
                  <span>本機圖片</span>
                  <input
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    id={`review-media-file-${String(index)}`}
                    name={`review-media-file-${String(index)}`}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (!file) return;
                      if (mapping.localUrl?.startsWith('blob:')) {
                        URL.revokeObjectURL(mapping.localUrl);
                        localObjectUrlsRef.current.delete(mapping.localUrl);
                      }
                      const localUrl = URL.createObjectURL(file);
                      localObjectUrlsRef.current.add(localUrl);
                      updateMapping(index, {
                        localUrl,
                      });
                    }}
                    type="file"
                  />
                </label>
              </fieldset>
            ))}
          </section>

          <aside className="review-markdown-preview__syntax">
            <h2>可用語法</h2>
            <code># 主標題</code>
            <code>## 次標題</code>
            <code>**粗體**</code>
            <code>==螢光標記==</code>
            <code>- 清單</code>
            <code>| 表格 |</code>
            <code>![替代文字](review-media:P301)</code>
          </aside>
        </section>

        <section
          aria-label="學生端顯示預覽"
          className="review-markdown-preview__preview"
          data-mobile-active={activeMobilePane === 'preview'}
        >
          <div className="review-markdown-preview__section-heading">
            <h2>學生端顯示</h2>
            <span>
              {compiled.errors.length === 0 ? '格式有效' : '需要修正'}
            </span>
          </div>
          {compiled.errors.length > 0 ? (
            <div
              className="review-markdown-preview__errors"
              id="review-markdown-preview-errors"
              role="alert"
            >
              {compiled.errors.map((error, index) => (
                <p key={`${error.code}-${String(index)}`}>{error.message}</p>
              ))}
            </div>
          ) : null}
          <article className="review-markdown-preview__paper">
            <ReviewCardMarkdown
              markdown={compiled.markdown}
              resolveImage={resolveImage}
            />
          </article>
        </section>
      </div>
    </main>
  );
}
