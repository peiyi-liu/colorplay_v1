const reviewMediaImagePattern =
  /!\[([^\]\n]+)\]\(review-media:([A-Za-z0-9_-]+)\)/gu;
const markdownImagePattern = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;

export function compileReviewCardMarkdown(markdown, mediaCatalog) {
  const media = [];
  const errors = [];
  const sourceMarkdown = String(markdown ?? '');
  const mediaCatalogEntries = Object.entries(mediaCatalog);
  const invalidAltReferences = new Set();
  if (sourceMarkdown.length > 8000) {
    errors.push({
      code: 'CONTENT_LENGTH_EXCEEDED',
      message: '複習卡內容最多 8000 字',
    });
  }
  if (/<\/?[A-Za-z][^>\n]*>/u.test(sourceMarkdown)) {
    errors.push({
      code: 'RAW_HTML_NOT_ALLOWED',
      message: '複習卡 Markdown 不允許 HTML 標籤',
    });
  }
  if (/=[a-z0-9]=[^\s=](?:[^\n]*?[^\s=])?==/iu.test(sourceMarkdown)) {
    errors.push({
      code: 'MARKER_COLOR_NOT_ALLOWED',
      message: '螢光標記只接受 ==文字==，不能指定其他顏色',
    });
  }
  for (const match of sourceMarkdown.matchAll(markdownImagePattern)) {
    const altText = String(match[1]);
    const source = String(match[2]);
    const referenceMatch = /^review-media:([A-Za-z0-9_-]+)$/u.exec(source);
    if (!referenceMatch) {
      errors.push({
        code: 'MEDIA_SOURCE_NOT_ALLOWED',
        message: '複習卡圖片必須使用 review-media:代號',
      });
    }
    if (altText.length < 1 || altText.length > 200) {
      const reference = referenceMatch?.[1] ?? source;
      invalidAltReferences.add(reference);
      errors.push({
        code: 'MEDIA_ALT_INVALID',
        message: '圖片替代文字必須是 1–200 字',
        reference,
      });
    }
  }
  for (const [reference, entry] of mediaCatalogEntries) {
    if (
      !invalidAltReferences.has(reference) &&
      (entry.altText.length < 1 || entry.altText.length > 200)
    ) {
      errors.push({
        code: 'MEDIA_ALT_INVALID',
        message: '圖片替代文字必須是 1–200 字',
        reference,
      });
    }
  }
  const compiled = sourceMarkdown.replace(
    reviewMediaImagePattern,
    (source, altText, reference) => {
      const entry = mediaCatalog[reference];
      if (!entry) {
        errors.push({
          code: 'MEDIA_REFERENCE_UNMAPPED',
          message: `圖片代號「${reference}」沒有核准的媒體 mapping`,
          reference,
        });
        return source;
      }
      if (entry.altText !== altText) {
        errors.push({
          code: 'MEDIA_ALT_MISMATCH',
          message: `圖片代號「${reference}」的替代文字與核准 mapping 不一致`,
          reference,
        });
        return source;
      }
      media.push({
        altText,
        assetPath: entry.assetPath,
        reference,
      });
      return `![${altText}](${entry.assetPath})`;
    },
  );
  if (media.length > 3 || mediaCatalogEntries.length > 3) {
    errors.push({
      code: 'MEDIA_LIMIT_EXCEEDED',
      message: '每張複習卡最多只能插入 3 張圖片',
    });
  }

  return { errors, markdown: compiled, media };
}
