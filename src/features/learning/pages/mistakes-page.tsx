import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import type {
  LearningRepository,
  MistakeView,
} from '../api/learning-repository';
import { useMistakes, useStartRemediation } from '../hooks/use-learning';

type SubtopicGroup = Readonly<{
  mistakes: readonly MistakeView[];
  subtopicId: string;
  subtopicTitle: string;
}>;

export const groupOpenMistakes = (
  mistakes: readonly MistakeView[],
): readonly SubtopicGroup[] => {
  const groups = new Map<string, MistakeView[]>();
  for (const mistake of mistakes) {
    if (mistake.status === 'resolved') continue;
    const list = groups.get(mistake.subtopicId) ?? [];
    list.push(mistake);
    groups.set(mistake.subtopicId, list);
  }
  return [...groups.values()].map((list) => ({
    mistakes: list,
    subtopicId: list[0]?.subtopicId ?? '',
    subtopicTitle: list[0]?.subtopicTitle ?? '',
  }));
};

export function MistakesPage({
  repository,
}: Readonly<{ repository?: LearningRepository }>) {
  const mistakes = useMistakes(repository);
  const start = useStartRemediation(repository);
  const navigate = useNavigate();
  const [startError, setStartError] = useState<string>();

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

  const openGroups = groupOpenMistakes(mistakes.data);
  const resolved = mistakes.data.filter(
    (mistake) => mistake.status === 'resolved',
  );

  return (
    <section aria-labelledby="mistakes-title" className="page-card page-narrow">
      <header>
        <p className="route-panel__eyebrow">補救學習</p>
        <h1 id="mistakes-title">我的錯題</h1>
        <p>
          補救練習答對即可解決錯題並回復精熟；不發 Token，XP 以 20%
          計，原始成績不會改變。
        </p>
      </header>

      {openGroups.length === 0 ? (
        <p role="status">目前沒有待補救的錯題，繼續保持！</p>
      ) : (
        openGroups.map((group) => (
          <section aria-label={group.subtopicTitle} key={group.subtopicId}>
            <h2>
              {group.subtopicTitle}（{group.mistakes.length} 題待補救）
            </h2>
            <ul className="mistake-list">
              {group.mistakes.map((mistake) => (
                <li className="mistake-list__item" key={mistake.mistakeId}>
                  <p className="mistake-list__prompt">
                    {mistake.prompt}
                    {mistake.status === 'reopened' ? '（再次答錯）' : ''}
                  </p>
                  <p className="mistake-list__answer">
                    正確答案：{mistake.correctOptionText}
                  </p>
                </li>
              ))}
            </ul>
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
                      void navigate(`/app/quiz/${sessionId}`);
                    },
                  },
                );
              }}
              type="button"
            >
              再挑戰（補救練習）
            </button>
          </section>
        ))
      )}
      {startError ? <p role="alert">{startError}</p> : null}

      {resolved.length > 0 ? (
        <section aria-label="已解決的錯題">
          <h2>已解決</h2>
          <ul>
            {resolved.map((mistake) => (
              <li key={mistake.mistakeId}>{mistake.prompt}（已解決）</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
