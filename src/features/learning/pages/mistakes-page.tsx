import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
import { SpiritAvatar } from '../../../components/ui/spirit-avatar';
import type {
  LearningRepository,
  MistakeView,
} from '../api/learning-repository';
import { useMistakes, useStartRemediation } from '../hooks/use-learning';
import {
  mistakeSubtopicAnchor,
  returnedMistakeSubtopic,
} from '../lib/remediation-navigation';

import './mistakes-page.css';

type SubtopicGroup = Readonly<{
  mistakes: readonly MistakeView[];
  subtopicId: string;
  subtopicTitle: string;
}>;

export const groupOpenMistakes = (
  mistakes: readonly MistakeView[],
  returnSubtopicId?: string,
): readonly SubtopicGroup[] => {
  const groups = new Map<
    string,
    { mistakes: MistakeView[]; subtopicId: string; subtopicTitle: string }
  >();
  for (const mistake of mistakes) {
    if (
      mistake.status === 'resolved' &&
      mistake.subtopicId !== returnSubtopicId
    )
      continue;
    const group = groups.get(mistake.subtopicId) ?? {
      mistakes: [],
      subtopicId: mistake.subtopicId,
      subtopicTitle: mistake.subtopicTitle,
    };
    if (mistake.status !== 'resolved') group.mistakes.push(mistake);
    groups.set(mistake.subtopicId, group);
  }
  return [...groups.values()];
};

export function MistakesPage({
  repository,
}: Readonly<{ repository?: LearningRepository }>) {
  const mistakes = useMistakes(repository);
  const start = useStartRemediation(repository);
  const navigate = useNavigate();
  const location = useLocation();
  const returnSubtopicId = returnedMistakeSubtopic(location.hash);
  const restoredLocation = useRef<string | undefined>(undefined);
  const [startError, setStartError] = useState<string>();
  const stageWide = useStageWide();

  useEffect(() => {
    if (
      !returnSubtopicId ||
      !mistakes.data ||
      mistakes.isFetching ||
      restoredLocation.current === location.key
    )
      return;
    const target = document.getElementById(
      mistakeSubtopicAnchor(returnSubtopicId),
    );
    if (target) {
      target.scrollIntoView({ block: 'start' });
      restoredLocation.current = location.key;
    }
  }, [location.key, mistakes.data, mistakes.isFetching, returnSubtopicId]);

  if (mistakes.isPending) return <RouteLoading withinMain />;
  if (mistakes.isError) {
    return (
      <section className="route-panel">
        <h1>我的錯題</h1>
        <p role="alert">無法載入錯題資料，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void mistakes.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const openGroups = groupOpenMistakes(mistakes.data, returnSubtopicId);
  const resolved = mistakes.data.filter(
    (mistake) => mistake.status === 'resolved',
  );

  return (
    <section
      aria-labelledby="mistakes-title"
      className="mistakes-codex mistakes-codex--archive-v2 scene-day"
    >
      <header>
        <h1 id="mistakes-title">我的錯題</h1>
        <p>補救練習答對即可解決錯題並回復精熟。</p>
      </header>

      {!openGroups.some((group) => group.mistakes.length > 0) && (
        <p role="status">目前沒有待補救的錯題，繼續保持！</p>
      )}
      {openGroups.map((group) => (
        <section
          aria-label={group.subtopicTitle}
          className="mistake-group"
          id={mistakeSubtopicAnchor(group.subtopicId)}
          key={group.subtopicId}
        >
          <h2 className="mistake-group__title">
            {group.subtopicTitle}{' '}
            {group.mistakes.length > 0 && (
              <span className="mistake-group__badge">
                {group.mistakes.length} 題待補救
              </span>
            )}
          </h2>
          {group.mistakes.length === 0 ? (
            <p role="status">這個小節的錯題已全部解決。</p>
          ) : (
            <>
              <GamePager
                ariaLabel={`${group.subtopicTitle} 錯題分頁`}
                items={group.mistakes}
                pageSize={stageWide ? 5 : 3}
              >
                {(pageItems) => (
                  <ul className="mistake-list">
                    {pageItems.map((mistake) => (
                      <li
                        className="mistake-list__item"
                        key={mistake.mistakeId}
                      >
                        <SpiritAvatar variant="red" />
                        <div className="mistake-list__body">
                          <p className="mistake-list__prompt">
                            {mistake.prompt}
                            {mistake.status === 'reopened'
                              ? '（再次答錯）'
                              : ''}
                          </p>
                          <p className="mistake-list__answer">
                            正確答案：{mistake.correctOptionText}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </GamePager>
              <div className="mistake-group__actions">
                <button
                  className="primary-action"
                  disabled={start.isPending}
                  onClick={() => {
                    setStartError(undefined);
                    start.mutate(
                      {
                        requestId: crypto.randomUUID(),
                        subtopicId: group.subtopicId,
                      },
                      {
                        onError: (error) => {
                          setStartError(error.message);
                        },
                        onSuccess: (sessionId) => {
                          void navigate(`/app/quiz/${sessionId}`, {
                            state: {
                              remediationReturnSubtopicId: group.subtopicId,
                            },
                          });
                        },
                      },
                    );
                  }}
                  type="button"
                >
                  再挑戰（補救練習）
                </button>
              </div>
            </>
          )}
        </section>
      ))}
      {startError ? <p role="alert">{startError}</p> : null}

      {resolved.length > 0 ? (
        <section aria-label="已解決的錯題" className="mistake-resolved">
          <h2 className="mistake-resolved__title">
            <span aria-hidden="true" className="mistake-resolved__dot" />
            已解決
          </h2>
          <GamePager
            ariaLabel="已解決錯題分頁"
            items={resolved}
            pageSize={stageWide ? 6 : 4}
          >
            {(pageItems) => (
              <ul className="mistake-resolved__list">
                {/* owner 0728:已解決題附正確答案,方便學生再複習。
                    owner 0730 #1:題目後方不再加「（已解決）」字尾。 */}
                {pageItems.map((mistake) => (
                  <li key={mistake.mistakeId}>
                    <span
                      aria-hidden="true"
                      className="codex-monster codex-monster--lit"
                    />
                    {mistake.prompt}
                    <span className="mistake-resolved__answer">
                      正確答案：{mistake.correctOptionText}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GamePager>
        </section>
      ) : null}
    </section>
  );
}
