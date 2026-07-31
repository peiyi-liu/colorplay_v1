import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Card } from '../../../components/ui/card';
import { Chip } from '../../../components/ui/chip';
import { HintCallout } from '../../../components/ui/hint-callout';
import { MapStepper } from '../../../components/ui/map-stepper';
import { SectionHeader } from '../../../components/ui/section-header';
import {
  SpiritAvatar,
  spiritForSeed,
  spiritLabels,
} from '../../../components/ui/spirit-avatar';
import { VictoryCard } from '../../../components/ui/victory-card';
import type { MasteryRepository } from '../api/mastery-repository';
import { usePublishedChapters } from '../api/chapters';
import {
  useMasteryHint,
  useMasteryState,
  useStartMastery,
  useSubmitMasteryAttempt,
} from '../hooks/use-mastery';

export function MissionSelectPage({
  repository,
}: Readonly<{ repository?: MasteryRepository }>) {
  const chapters = usePublishedChapters();
  const start = useStartMastery(repository);
  const navigate = useNavigate();
  const [startError, setStartError] = useState<string>();

  if (chapters.isPending) return <RouteLoading withinMain />;
  if (chapters.isError) {
    return (
      <section className="route-panel">
        <h1>課後任務實戰</h1>
        <p role="alert">章節暫時無法載入，請稍後重試。</p>
      </section>
    );
  }

  const playable = (chapters.data ?? []).filter(
    (chapter) => chapter.isPlayable,
  );

  return (
    <section aria-labelledby="mission-select-title" className="mission-select">
      <Card padding="lg">
        <SectionHeader
          chip={<Chip tone="primary">5 階精熟測驗</Chip>}
          title="課後任務實戰"
          description="不限時、可多次嘗試；答錯會鎖定該選項並逐層解鎖提示。完成全部關卡即精熟本章。"
        />
        <h1 className="visually-hidden" id="mission-select-title">
          課後任務實戰
        </h1>
        {startError ? <p role="alert">{startError}</p> : null}
        {playable.length === 0 ? (
          <p>目前沒有可挑戰的章節。</p>
        ) : (
          <ul className="mission-select__list">
            {playable.map((chapter) => {
              return (
                <li className="mission-select__item" key={chapter.id}>
                  <div>
                    <h2>{chapter.title}</h2>
                    {/* owner 0730 #5:測驗小節分節、標題完整列出。 */}
                    {chapter.subtopicTitles.length > 0 ? (
                      <ul
                        aria-label={`${chapter.title} 小節`}
                        className="mission-select__subtopics"
                      >
                        {chapter.subtopicTitles.map((subtopicTitle) => (
                          <li key={subtopicTitle}>{subtopicTitle}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{chapter.description}</p>
                    )}
                  </div>
                  <button
                    className="primary-action"
                    disabled={start.isPending}
                    onClick={() => {
                      setStartError(undefined);
                      start.mutate(chapter.id, {
                        onError: () => {
                          setStartError('無法開始精熟任務，請稍後重試。');
                        },
                        onSuccess: (sessionId) => {
                          void navigate(`/app/missions/${sessionId}`);
                        },
                      });
                    }}
                    type="button"
                  >
                    展開小節任務
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

type RevealedHint = Readonly<{ content: string; hintLevel: number }>;

export function MissionPage({
  repository,
  sessionId: suppliedSessionId,
}: Readonly<{ repository?: MasteryRepository; sessionId?: string }>) {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = suppliedSessionId ?? params.sessionId ?? '';
  const state = useMasteryState(sessionId, repository);
  const submit = useSubmitMasteryAttempt(sessionId, repository);
  const hint = useMasteryHint(sessionId, repository);
  const restart = useStartMastery(repository);
  const [hints, setHints] = useState<readonly RevealedHint[]>([]);
  const [feedback, setFeedback] = useState<string>();
  // owner 0730 #7:作答方式與大廳開始任務一致(radio 選定後按「送出答案」)。
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  // 答對後先停在回饋卡（與課後學習大廳的答題節奏一致），按「下一關」才前進。
  const [resolved, setResolved] = useState<
    | Readonly<{ explanation: string; isLast: boolean; mentorSeed: string }>
    | undefined
  >();
  const lastQuestionId = useRef<string | undefined>(undefined);

  const questionId = state.data?.question?.questionId;
  useEffect(() => {
    if (questionId !== lastQuestionId.current) {
      lastQuestionId.current = questionId;
      setHints([]);
      setFeedback(undefined);
      setSelectedOptionId(undefined);
    }
  }, [questionId]);

  if (state.isPending) return <RouteLoading withinMain />;
  if (state.isError) {
    return (
      <section className="route-panel">
        <h1>任務無法載入</h1>
        <p role="alert">找不到這個精熟任務，請回任務實戰重新開始。</p>
        <Link className="primary-action" to="/app/missions">
          回任務實戰
        </Link>
      </section>
    );
  }

  const mastery = state.data;

  return (
    <section aria-labelledby="mission-title" className="quiz-runner mission">
      <div className="quiz-map-panel">
        <p className="quiz-map-panel__caption">
          精熟學習地圖(未通過上一關前不可跳關)
        </p>
        <MapStepper
          currentIndex={mastery.position - 1}
          onJump={() => undefined}
          total={mastery.questionCount}
          unlockedCount={mastery.position}
        />
      </div>

      {/* live-v2 設計稿:任務關卡沿用限時挑戰的 quiz-runner 標頭版型。 */}
      <header className="quiz-runner__header">
        <div>
          <p className="route-panel__eyebrow">課後任務實戰</p>
          <h1 id="mission-title">
            {mastery.question?.subtopicTitle ?? mastery.chapterTitle}
          </h1>
        </div>
        <div className="quiz-runner__status" aria-label="關卡進度">
          <p>
            第 {mastery.position} / {mastery.questionCount} 關
          </p>
          {mastery.question ? (
            <p>本關已嘗試 {mastery.question.wrongAttempts} 次</p>
          ) : null}
        </div>
      </header>

      {resolved ? (
        <aside
          aria-labelledby="mission-feedback-title"
          className="feedback-card feedback-card--correct"
        >
          <h2 id="mission-feedback-title">✓ 答對了</h2>
          <div className="feedback-card__mentor">
            <SpiritAvatar variant={spiritForSeed(resolved.mentorSeed)} />
            <span
              className={`feedback-card__mentor-name feedback-card__mentor-name--${spiritForSeed(resolved.mentorSeed)}`}
            >
              {spiritLabels[spiritForSeed(resolved.mentorSeed)]}
            </span>
          </div>
          {resolved.explanation ? (
            <div className="live-explanation">
              <strong>教師引導解析:</strong>
              <p>{resolved.explanation}</p>
            </div>
          ) : null}
          <button
            className="primary-action"
            data-primary-action="true"
            onClick={() => {
              setResolved(undefined);
            }}
            type="button"
          >
            {resolved.isLast ? '查看結算 →' : '下一關 →'}
          </button>
        </aside>
      ) : mastery.status === 'completed' || !mastery.question ? (
        <VictoryCard
          description="本章 5 階精熟已全部通過！精熟紀錄已由伺服器保存；正式獎勵以限時挑戰與 Live 為準。"
          onRetry={() => {
            restart.mutate(mastery.chapterId, {
              onError: () => {
                setFeedback('無法重新開始練習，請稍後重試。');
              },
              onSuccess: (newSessionId) => {
                if (newSessionId === sessionId) {
                  void state.refetch();
                  return;
                }
                void navigate(`/app/missions/${newSessionId}`, {
                  replace: true,
                });
              },
            });
          }}
          title="階段任務挑戰完成！"
          tokens={0}
          xp={0}
        />
      ) : (
        <>
          <form
            className="question-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (submit.isPending || selectedOptionId === undefined) return;
              submit.mutate(selectedOptionId, {
                onError: () => {
                  setFeedback('作答未送出，請再試一次。');
                },
                onSuccess: (result) => {
                  if (result.isCorrect) {
                    setResolved({
                      explanation: result.explanation,
                      isLast: mastery.position === mastery.questionCount,
                      mentorSeed:
                        mastery.question?.subtopicTitle ?? mastery.chapterTitle,
                    });
                    return;
                  }
                  // 答錯的選項鎖定後不可再選，清掉選取讓學生重新挑選。
                  setSelectedOptionId(undefined);
                  setFeedback('✕ 還不對，該選項已鎖定。可索取提示後再試。');
                },
              });
            }}
          >
            <fieldset disabled={submit.isPending}>
              <legend>{mastery.question.prompt}</legend>
              <div className="question-options">
                {mastery.question.options.map((option) => (
                  <label
                    className="question-option"
                    data-locked={option.locked ? 'true' : undefined}
                    data-selected={
                      selectedOptionId === option.id ? 'true' : 'false'
                    }
                    key={option.id}
                  >
                    <input
                      checked={selectedOptionId === option.id}
                      disabled={option.locked}
                      name={`mission-${questionId ?? 'question'}`}
                      onChange={() => {
                        setSelectedOptionId(option.id);
                      }}
                      type="radio"
                      value={option.id}
                    />
                    <span className="question-option__key" aria-hidden="true">
                      {option.key}
                    </span>
                    <span>{option.text}</span>
                    {option.locked ? <span aria-hidden="true">●</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="question-card__action">
              <button
                className="primary-action"
                data-primary-action="true"
                disabled={submit.isPending || selectedOptionId === undefined}
                type="submit"
              >
                {submit.isPending ? '送出中…' : '送出答案'}
              </button>
            </div>
          </form>

          {feedback ? <p role="status">{feedback}</p> : null}

          <div className="mission__hints">
            {hints.map((revealed) => (
              <HintCallout
                key={revealed.hintLevel}
                tier={revealed.hintLevel === 1 ? 1 : 2}
              >
                {revealed.content}
              </HintCallout>
            ))}
            {hints.length < 3 &&
            mastery.question.wrongAttempts > hints.length ? (
              <button
                className="mission__hint-button"
                disabled={hint.isPending}
                onClick={() => {
                  hint.mutate(hints.length + 1, {
                    onError: () => {
                      setFeedback('提示暫時無法取得。');
                    },
                    onSuccess: (revealed) => {
                      setHints((previous) => [...previous, revealed]);
                    },
                  });
                }}
                type="button"
              >
                索取第 {hints.length + 1} 層提示
              </button>
            ) : null}
          </div>
        </>
      )}
      <div className="mission__footer">
        <Link className="lobby-link" to="/app/missions">
          ← 回任務實戰
        </Link>
      </div>
    </section>
  );
}
