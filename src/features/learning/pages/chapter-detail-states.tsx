import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import type { ChapterAccessBlocker } from '../api/chapter-map';
import type { LearningErrorCode } from '../api/learning-repository';
import type { MasteryDisplay } from './chapter-detail-view-model';

// 固定 code→copy 對照表——不顯示 raw code，不由前端推導新的 unmet condition。
const blockerText = (blocker: ChapterAccessBlocker): string => {
  if (blocker.code === 'PREREQUISITE_MASTERY') {
    return `${blocker.chapterTitle}精熟度需達 ${String(blocker.required ?? 0)}%（目前 ${String(blocker.current ?? 0)}%）`;
  }
  if (blocker.code === 'PREREQUISITE_REVIEW') {
    return `${blocker.chapterTitle}的複習卡尚未全部完成`;
  }
  return `${blocker.chapterTitle}內容尚未開放`;
};

export function LoadingState() {
  return (
    <p aria-live="polite" role="status">
      章節資料載入中…
    </p>
  );
}

export function LockedState({
  chapterTitle,
  unmetConditions,
}: Readonly<{
  chapterTitle: string;
  unmetConditions: readonly ChapterAccessBlocker[];
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section
      aria-label={`${chapterTitle}：鎖定中`}
      className="chapter-dungeon scene-dungeon chapter-detail-state chapter-detail-state--locked"
      role="region"
    >
      <span aria-hidden="true" className="chapter-detail-state__icon">
        🔒
      </span>
      <h1 ref={headingRef} tabIndex={-1}>
        {chapterTitle}
      </h1>
      {unmetConditions.length > 0 ? (
        <>
          <p>這個章節目前鎖定，需要先完成：</p>
          <ul>
            {unmetConditions.map((blocker) => (
              <li key={`${blocker.chapterId}-${blocker.code}`}>
                {blockerText(blocker)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>這個章節目前鎖定，正在重新確認開放條件…</p>
      )}
    </section>
  );
}

export function ContentPreparingState({
  chapterTitle,
}: Readonly<{ chapterTitle: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section
      aria-label={`${chapterTitle}：內容準備中`}
      className="chapter-dungeon scene-dungeon chapter-detail-state chapter-detail-state--preparing"
      role="region"
    >
      <span aria-hidden="true" className="chapter-detail-state__icon">
        🛠️
      </span>
      <h1 ref={headingRef} tabIndex={-1}>
        {chapterTitle}
      </h1>
      <p>這個章節的內容還在準備中，敬請期待。</p>
    </section>
  );
}

export function ContentReadinessErrorState({
  chapterTitle,
  reason,
}: Readonly<{ chapterTitle: string; reason: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section
      aria-label={`${chapterTitle}：內容異常`}
      className="chapter-dungeon scene-dungeon chapter-detail-state chapter-detail-state--readiness-error"
    >
      <h1 ref={headingRef} tabIndex={-1}>
        {chapterTitle}
      </h1>
      <p aria-live="assertive" role="alert">
        {reason}
      </p>
    </section>
  );
}

export function ErrorState({
  errorCode,
  onRetry,
  retryable,
}: Readonly<{
  errorCode: LearningErrorCode | 'CHAPTER_NOT_FOUND';
  onRetry: (() => void) | undefined;
  retryable: boolean;
}>) {
  if (errorCode === 'CHAPTER_NOT_FOUND') {
    return (
      <section className="route-panel chapter-detail-state chapter-detail-state--error">
        <h1>章節複習</h1>
        <p role="alert">找不到這個章節，或內容尚未發布。</p>
        <Link className="primary-action" to="/app">
          回學習地圖
        </Link>
      </section>
    );
  }
  return (
    <section className="route-panel chapter-detail-state chapter-detail-state--error">
      <h1>章節複習</h1>
      <p role="alert">章節狀態暫時無法確認</p>
      {retryable && onRetry ? (
        <button className="primary-action" onClick={onRetry} type="button">
          重試
        </button>
      ) : null}
    </section>
  );
}

export function MasteryDisplayView({
  display,
}: Readonly<{ display: MasteryDisplay }>) {
  if (display.kind === 'legacy-recorded') {
    return (
      <span className="chapter-detail__mastery-value chapter-detail__mastery-value--legacy">
        <span className="chapter-detail__mastery-primary">
          目前記錄精熟度 {display.masteryPercent}%
        </span>
        <span className="chapter-detail__mastery-secondary">
          規則版本 {display.rulesVersion}；跨版本比較尚待資料更新
        </span>
      </span>
    );
  }
  if (display.kind === 'not-attempted-current-version') {
    return (
      <span className="chapter-detail__mastery-value">
        目前版本尚未測驗（{display.currentContentVersion}）
      </span>
    );
  }
  if (display.kind === 'unavailable-until-backend-contract') {
    return (
      <span className="chapter-detail__mastery-value chapter-detail__mastery-value--pending">
        精熟度資料暫時無法確認
      </span>
    );
  }
  const { current, highest, merged } = display;
  if (merged) {
    return (
      <span className="chapter-detail__mastery-value">
        {highest.masteryPercent}%（{highest.contentVersion}）
      </span>
    );
  }
  return (
    <span className="chapter-detail__mastery-value chapter-detail__mastery-value--dual">
      <span className="chapter-detail__mastery-primary">
        {highest.masteryPercent}%（{highest.contentVersion}）
      </span>
      <span className="chapter-detail__mastery-secondary">
        {'masteryPercent' in current
          ? `${String(current.masteryPercent)}%（${current.contentVersion}）`
          : '目前版本尚未測驗'}
      </span>
    </span>
  );
}

export const chapterMasteryRingValue = (
  display: MasteryDisplay,
): number | null => {
  if (display.kind === 'legacy-recorded') return display.masteryPercent;
  if (display.kind === 'versioned') return display.highest.masteryPercent;
  return null;
};
