import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type {
  ChapterDetailCardView,
  ChapterDetailSubtopicView,
} from './chapter-detail-view-model';
import { ChapterReviewNode } from './chapter-review-node';

const CARDS_PER_PAGE = 6;

const firstAvailableCard = (
  cards: readonly ChapterDetailCardView[],
): ChapterDetailCardView | null =>
  cards.find((card) => !card.completed) ?? cards[0] ?? null;

const torchStates = (
  completed: number,
  total: number | null,
): readonly boolean[] => {
  if (total === null || total <= 0) return [];
  const shown = Math.min(total, 10);
  const lit = Math.min(shown, Math.round((completed / total) * shown));
  return Array.from({ length: shown }, (_, index) => index < lit);
};

export function ChapterReviewLibrary({
  artIndexByCardId,
  challengeHref,
  currentCardId,
  onEnter,
  subtopics,
}: Readonly<{
  artIndexByCardId: ReadonlyMap<string, number>;
  challengeHref: string | null;
  currentCardId: string | null;
  onEnter: (card: ChapterDetailCardView) => void;
  subtopics: readonly ChapterDetailSubtopicView[];
}>) {
  const initialSubtopic =
    subtopics.find((subtopic) =>
      subtopic.cards.some((card) => card.cardId === currentCardId),
    ) ??
    subtopics[0] ??
    null;
  const [activeSubtopicId, setActiveSubtopicId] = useState<string | null>(
    initialSubtopic?.subtopicId ?? null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    currentCardId,
  );

  const activeSubtopic =
    subtopics.find((subtopic) => subtopic.subtopicId === activeSubtopicId) ??
    initialSubtopic;
  const pageCount = Math.max(
    1,
    Math.ceil((activeSubtopic?.cards.length ?? 0) / CARDS_PER_PAGE),
  );
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleCards = useMemo(
    () =>
      activeSubtopic?.cards.slice(
        safePageIndex * CARDS_PER_PAGE,
        (safePageIndex + 1) * CARDS_PER_PAGE,
      ) ?? [],
    [activeSubtopic, safePageIndex],
  );
  const selectedCard =
    visibleCards.find((card) => card.cardId === selectedCardId) ??
    firstAvailableCard(visibleCards);

  useEffect(() => {
    const selected = selectedCard
      ? document.getElementById(`review-card-${selectedCard.cardId}`)
      : null;
    selected?.focus();
  }, [selectedCard]);

  const selectPage = (nextPageIndex: number) => {
    if (!activeSubtopic) return;
    const nextCards = activeSubtopic.cards.slice(
      nextPageIndex * CARDS_PER_PAGE,
      (nextPageIndex + 1) * CARDS_PER_PAGE,
    );
    setPageIndex(nextPageIndex);
    setSelectedCardId(firstAvailableCard(nextCards)?.cardId ?? null);
  };

  return (
    <>
      <div className="chapter-archive__library">
        <nav aria-label="第三章小節" className="chapter-archive__subtopic-menu">
          <p className="chapter-archive__subtopic-menu-title">小節目錄</p>
          <div className="chapter-archive__subtopic-menu-list">
            {subtopics.map((subtopic) => {
              const active = subtopic.subtopicId === activeSubtopic?.subtopicId;
              return (
                <button
                  aria-current={active ? 'true' : undefined}
                  aria-label={subtopic.title}
                  className="chapter-archive__subtopic-menu-item"
                  key={subtopic.subtopicId}
                  onClick={() => {
                    setActiveSubtopicId(subtopic.subtopicId);
                    setPageIndex(0);
                    setSelectedCardId(
                      firstAvailableCard(subtopic.cards)?.cardId ?? null,
                    );
                  }}
                  type="button"
                >
                  <span className="chapter-archive__subtopic-menu-name">
                    {subtopic.title}
                  </span>
                  <span className="chapter-archive__subtopic-menu-count">
                    {String(subtopic.cards.length)} 張
                  </span>
                </button>
              );
            })}
          </div>
          <div
            aria-label="挑戰入口"
            className="chapter-archive__challenge-actions"
            role="group"
          >
            {activeSubtopic?.quizTemplateId ? (
              <Link
                className="secondary-action chapter-archive__challenge-action"
                to={`/app/quiz/new?template=${activeSubtopic.quizTemplateId}`}
              >
                小節挑戰
              </Link>
            ) : (
              <button
                aria-label="小節挑戰（題庫準備中）"
                className="secondary-action chapter-archive__challenge-action"
                disabled
                title="小節題庫完成綁定後開放"
                type="button"
              >
                <span>小節挑戰</span>
                <small>題庫準備中</small>
              </button>
            )}
            {challengeHref ? (
              <Link
                className="secondary-action chapter-archive__challenge-action chapter-archive__challenge-action--chapter"
                to={challengeHref}
              >
                章節總挑戰
              </Link>
            ) : (
              <button
                aria-label="章節總挑戰（題庫準備中）"
                className="secondary-action chapter-archive__challenge-action"
                disabled
                type="button"
              >
                <span>章節總挑戰</span>
                <small>題庫準備中</small>
              </button>
            )}
          </div>
        </nav>

        {activeSubtopic ? (
          <section
            aria-label={activeSubtopic.title}
            className="chapter-detail__subtopic chapter-archive__subtopic"
          >
            {torchStates(
              activeSubtopic.reviewCompleted,
              activeSubtopic.reviewTotal,
            ).length > 0 ? (
              <span aria-hidden="true" className="floor-torches">
                {torchStates(
                  activeSubtopic.reviewCompleted,
                  activeSubtopic.reviewTotal,
                ).map((lit, index) => (
                  <span
                    className={
                      lit ? 'floor-torch floor-torch--lit' : 'floor-torch'
                    }
                    key={index}
                  />
                ))}
              </span>
            ) : null}
            <div className="chapter-archive__nodes">
              {visibleCards.map((card) => (
                <ChapterReviewNode
                  artIndex={artIndexByCardId.get(card.cardId) ?? 0}
                  card={card}
                  completed={card.completed}
                  current={currentCardId === card.cardId}
                  key={card.cardId}
                  onSelect={() => {
                    setSelectedCardId(card.cardId);
                  }}
                  selected={selectedCard?.cardId === card.cardId}
                />
              ))}
            </div>
            {pageCount > 1 ? (
              <nav
                aria-label={`${activeSubtopic.title} 複習卡分頁`}
                className="chapter-archive__pagination"
              >
                <button
                  aria-label="上一頁"
                  className="chapter-archive__page-button"
                  disabled={safePageIndex === 0}
                  onClick={() => {
                    selectPage(safePageIndex - 1);
                  }}
                  type="button"
                >
                  ‹
                </button>
                <span
                  aria-live="polite"
                  className="chapter-archive__page-status"
                >
                  第 {String(safePageIndex + 1)} / {String(pageCount)} 頁
                </span>
                <button
                  aria-label="下一頁"
                  className="chapter-archive__page-button"
                  disabled={safePageIndex === pageCount - 1}
                  onClick={() => {
                    selectPage(safePageIndex + 1);
                  }}
                  type="button"
                >
                  ›
                </button>
              </nav>
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className="chapter-archive__actions">
        <button
          className="primary-action chapter-archive__continue"
          data-primary-action="true"
          disabled={!selectedCard}
          onClick={() => {
            if (selectedCard) onEnter(selectedCard);
          }}
          type="button"
        >
          <span>進入複習</span>
        </button>
      </footer>
    </>
  );
}
