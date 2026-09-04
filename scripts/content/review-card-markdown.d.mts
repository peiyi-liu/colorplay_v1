export type ReviewCardMarkdownMedia = Readonly<{
  altText: string;
  assetPath: string;
  reference: string;
}>;

export type ReviewCardMarkdownError =
  | Readonly<{
      code:
        'MEDIA_ALT_INVALID' | 'MEDIA_ALT_MISMATCH' | 'MEDIA_REFERENCE_UNMAPPED';
      message: string;
      reference: string;
    }>
  | Readonly<{
      code:
        | 'MEDIA_LIMIT_EXCEEDED'
        | 'MEDIA_SOURCE_NOT_ALLOWED'
        | 'CONTENT_LENGTH_EXCEEDED'
        | 'MARKER_COLOR_NOT_ALLOWED'
        | 'RAW_HTML_NOT_ALLOWED';
      message: string;
    }>;

export function compileReviewCardMarkdown(
  markdown: string,
  mediaCatalog: Readonly<
    Record<string, Readonly<{ altText: string; assetPath: string }>>
  >,
): Readonly<{
  errors: readonly ReviewCardMarkdownError[];
  markdown: string;
  media: readonly ReviewCardMarkdownMedia[];
}>;
