import { useState } from 'react';

export function ReviewCardMedia({
  altText,
  assetPath,
  blockKey,
  loading,
  onLoad,
  sizes,
  srcSet,
  height,
  width,
}: Readonly<{
  altText: string;
  assetPath: string | null;
  blockKey: string;
  height?: number;
  loading: boolean;
  onLoad: () => void;
  sizes?: string;
  srcSet?: string;
  width?: number;
}>) {
  const [failed, setFailed] = useState(false);

  if (loading) {
    return (
      <p
        aria-label={`圖片載入中：${altText}`}
        className="review-card__media-fallback review-card__media-fallback--loading"
        data-book-block-key={blockKey}
        role="status"
      >
        圖片載入中：{altText}
      </p>
    );
  }

  if (failed || assetPath === null) {
    return (
      <p
        aria-label={altText}
        className="review-card__media-fallback"
        data-book-block-key={blockKey}
        role="img"
      >
        圖片載入失敗：{altText}
      </p>
    );
  }

  return (
    <img
      alt={altText}
      className="review-card__media"
      data-book-block-key={blockKey}
      decoding="async"
      loading="lazy"
      height={height}
      onError={() => {
        setFailed(true);
      }}
      onLoad={onLoad}
      sizes={sizes}
      src={assetPath}
      srcSet={srcSet}
      width={width}
    />
  );
}
