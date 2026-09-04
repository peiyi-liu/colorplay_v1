import { useState } from 'react';
import ReactMarkdown, {
  type Components,
  type UrlTransform,
} from 'react-markdown';
import remarkFlexibleMarkers from 'remark-flexible-markers';
import remarkGfm from 'remark-gfm';

import '../../../styles/review-card-markdown.css';

export type ReviewCardImageResolution = Readonly<{
  loading: boolean;
  resolvedUrl: string | null;
}>;

const allowedElements = [
  'h1',
  'h2',
  'h3',
  'p',
  'br',
  'strong',
  'em',
  'mark',
  'blockquote',
  'ul',
  'ol',
  'li',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
] as const;

const reviewCardUrlTransform: UrlTransform = (url, key, node) => {
  if (
    key === 'src' &&
    node.tagName === 'img' &&
    (url.startsWith('review-media:') ||
      url.startsWith('review-card-media/') ||
      !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(url))
  ) {
    return url;
  }
  return null;
};

function MarkdownImage({
  alt,
  onLoad,
  resolveImage,
  source,
}: Readonly<{
  alt: string;
  onLoad: () => void;
  resolveImage: (source: string) => ReviewCardImageResolution;
  source: string;
}>) {
  const [failed, setFailed] = useState(false);
  const resolution = resolveImage(source);
  const accessibleAlt = alt.trim() || '複習卡圖片';

  if (resolution.loading) {
    return (
      <span
        aria-label={`圖片載入中：${accessibleAlt}`}
        className="review-card__media-fallback review-card__media-fallback--loading"
        role="status"
      >
        圖片載入中：{accessibleAlt}
      </span>
    );
  }

  if (failed || resolution.resolvedUrl === null) {
    return (
      <span
        aria-label={accessibleAlt}
        className="review-card__media-fallback"
        role="img"
      >
        圖片載入失敗：{accessibleAlt}
      </span>
    );
  }

  return (
    <img
      alt={accessibleAlt}
      className="review-card__media"
      decoding="async"
      loading="lazy"
      onError={() => {
        setFailed(true);
      }}
      onLoad={onLoad}
      src={resolution.resolvedUrl}
    />
  );
}

export function ReviewCardMarkdown({
  markdown,
  onMediaLoad = () => undefined,
  resolveImage,
}: Readonly<{
  markdown: string;
  onMediaLoad?: () => void;
  resolveImage: (source: string) => ReviewCardImageResolution;
}>) {
  const components: Components = {
    img: ({ alt = '', src }) => (
      <MarkdownImage
        alt={alt}
        onLoad={onMediaLoad}
        resolveImage={resolveImage}
        source={typeof src === 'string' ? src : ''}
      />
    ),
  };

  return (
    <div className="review-card-markdown">
      <ReactMarkdown
        allowedElements={allowedElements}
        components={components}
        remarkPlugins={[remarkGfm, remarkFlexibleMarkers]}
        skipHtml
        unwrapDisallowed
        urlTransform={reviewCardUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
