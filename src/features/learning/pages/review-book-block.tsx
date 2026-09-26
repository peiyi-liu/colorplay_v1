import {
  ReviewCardMarkdown,
  type ReviewCardImageResolution,
} from '../components/review-card-markdown';
import { ReviewCardMedia } from './review-card-media';

export type ReaderBookBlock =
  | Readonly<{
      displayTitle: string;
      key: string;
      kind: 'intro';
      title: string;
    }>
  | Readonly<{
      keepWithNext?: boolean;
      paginationGroupKey?: string;
      key: string;
      kind: 'markdown';
      markdown: string;
      splittable: boolean;
    }>
  | Readonly<{
      altText: string;
      assetPath: string | null;
      height?: number;
      key: string;
      kind: 'media';
      loading: boolean;
      sizes?: string;
      srcSet?: string;
      width?: number;
    }>;

export function ReaderBookBlockContent({
  block,
  onMediaLoad,
  resolveImage,
  text,
}: Readonly<{
  block: ReaderBookBlock;
  onMediaLoad: () => void;
  resolveImage: (source: string) => ReviewCardImageResolution;
  text?: string;
}>) {
  if (block.kind === 'intro') {
    return (
      <div
        className="chapter-review-reader__intro"
        data-book-block-key={block.key}
      >
        <h2 className="chapter-review-reader__book-title">
          {block.displayTitle}
        </h2>
        {block.displayTitle !== block.title ? (
          <p className="chapter-review-reader__subtitle">{block.title}</p>
        ) : null}
      </div>
    );
  }

  if (block.kind === 'markdown') {
    return (
      <div
        className="chapter-review-reader__content"
        data-book-block-key={block.key}
      >
        <ReviewCardMarkdown
          markdown={text ?? block.markdown}
          onMediaLoad={onMediaLoad}
          resolveImage={resolveImage}
        />
      </div>
    );
  }

  return (
    <ReviewCardMedia
      altText={block.altText}
      assetPath={block.assetPath}
      blockKey={block.key}
      {...(block.height === undefined ? {} : { height: block.height })}
      key={`${block.key}:${block.assetPath ?? 'unavailable'}`}
      loading={block.loading}
      onLoad={onMediaLoad}
      {...(block.sizes === undefined ? {} : { sizes: block.sizes })}
      {...(block.srcSet === undefined ? {} : { srcSet: block.srcSet })}
      {...(block.width === undefined ? {} : { width: block.width })}
    />
  );
}
