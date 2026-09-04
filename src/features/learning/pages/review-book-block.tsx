import { ReviewCardMedia } from './review-card-media';

export type ReaderBookBlock =
  | Readonly<{
      displayTitle: string;
      key: string;
      kind: 'intro';
      title: string;
    }>
  | Readonly<{
      key: string;
      kind: 'paragraph';
      text: string;
    }>
  | Readonly<{
      altText: string;
      assetPath: string | null;
      key: string;
      kind: 'media';
      loading: boolean;
    }>;

export function ReaderBookBlockContent({
  block,
  onMediaLoad,
  text,
}: Readonly<{
  block: ReaderBookBlock;
  onMediaLoad: () => void;
  text?: string;
}>) {
  if (block.kind === 'intro') {
    return (
      <div
        className="chapter-review-reader__intro"
        data-book-block-key={block.key}
      >
        <p className="chapter-review-reader__eyebrow">REVIEW ARCHIVE</p>
        <h2 className="chapter-review-reader__book-title">
          {block.displayTitle}
        </h2>
        {block.displayTitle !== block.title ? (
          <p className="chapter-review-reader__subtitle">{block.title}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === 'paragraph') {
    return (
      <p
        className="chapter-review-reader__content"
        data-book-block-key={block.key}
      >
        {text ?? block.text}
      </p>
    );
  }

  return (
    <ReviewCardMedia
      altText={block.altText}
      assetPath={block.assetPath}
      blockKey={block.key}
      key={`${block.key}:${block.assetPath ?? 'unavailable'}`}
      loading={block.loading}
      onLoad={onMediaLoad}
    />
  );
}
