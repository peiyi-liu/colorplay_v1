import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Card } from '../../../components/ui/card';
import { Chip } from '../../../components/ui/chip';
import { HintCallout } from '../../../components/ui/hint-callout';
import { MapStepper } from '../../../components/ui/map-stepper';
import { SectionHeader } from '../../../components/ui/section-header';
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
          chip={<Chip tone="primary">🧪 5 階精熟測驗</Chip>}
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
            {playable.map((chapter) => (
              <li className="mission-select__item" key={chapter.id}>
                <div>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.description}</p>
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
            ))}
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
  const sessionId = suppliedSessionId ?? params.sessionId ?? '';
  const state = useMasteryState(sessionId, repository);
  const submit = useSubmitMasteryAttempt(sessionId, repository);
  const hint = useMasteryHint(sessionId, repository);
  const [hints, setHints] = useState<readonly RevealedHint[]>([]);
  const [feedback, setFeedback] = useState<string>();
  const [explanation, setExplanation] = useState<string>();
  const lastQuestionId = useRef<string | undefined>(undefined);

  const questionId = state.data?.question?.questionId;
  useEffect(() => {
    if (questionId !== lastQuestionId.current) {
      lastQuestionId.current = questionId;
      setHints([]);
      setFeedback(undefined);
      setExplanation(undefined);
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
  const completedCount = mastery.stages.filter(
    (stage) => stage.completed,
  ).length;

  return (
    <section aria-labelledby="mission-title" className="mission">
      <Card padding="lg" className="animate-fade-in">
        <div className="quiz-map-panel">
          <p className="quiz-map-panel__caption">
            🗺️ 精熟學習地圖（未通過上一關前不可跳關）
          </p>
          <MapStepper
            currentIndex={mastery.position - 1}
            onJump={() => undefined}
            total={mastery.questionCount}
            unlockedCount={mastery.position}
          />
        </div>

        <SectionHeader
          chip={
            <Chip tone="primary">
              🧪 關卡進度：{mastery.position} / {mastery.questionCount}
            </Chip>
          }
          title={mastery.chapterTitle}
          {...(mastery.question?.subtopicTitle
            ? { description: mastery.question.subtopicTitle }
            : {})}
        />
        <h1 className="visually-hidden" id="mission-title">
          課後任務實戰：{mastery.chapterTitle}
        </h1>

        {mastery.status === 'completed' || !mastery.question ? (
          <VictoryCard
            description="本章 5 階精熟已全部通過！精熟紀錄已由伺服器保存；正式獎勵以限時挑戰與 Live 為準。"
            onRetry={() => {
              void state.refetch();
            }}
            title="階段任務挑戰完成！"
            tokens={0}
            xp={0}
          />
        ) : (
          <>
            <div className="mission__scenario">
              <p className="mission__scenario-label">
                <span aria-hidden="true">🧭 </span>情境任務
              </p>
              <p className="mission__prompt">{mastery.question.prompt}</p>
            </div>

            <p className="mission__instruction">
              <span aria-hidden="true">🖐️ </span>
              請點擊選擇最佳色彩策略（答錯會鎖定該選項）：
            </p>
            <div className="mission__options">
              {mastery.question.options.map((option) => (
                <button
                  className="mission-option"
                  data-locked={option.locked}
                  disabled={option.locked || submit.isPending}
                  key={option.id}
                  onClick={() => {
                    submit.mutate(option.id, {
                      onError: () => {
                        setFeedback('作答未送出，請再試一次。');
                      },
                      onSuccess: (result) => {
                        if (result.isCorrect) {
                          setFeedback('✓ 答對了！');
                          setExplanation(result.explanation);
                          return;
                        }
                        setFeedback(
                          '✕ 還不對，該選項已鎖定。可索取提示後再試。',
                        );
                      },
                    });
                  }}
                  type="button"
                >
                  <span className="mission-option__key" aria-hidden="true">
                    {option.key}
                  </span>
                  <span>{option.text}</span>
                  {option.locked ? <span aria-hidden="true">🔒</span> : null}
                </button>
              ))}
            </div>

            {feedback ? <p role="status">{feedback}</p> : null}
            {explanation ? (
              <div className="live-explanation">
                <strong>👨‍🏫 教師引導解析：</strong>
                <p>{explanation}</p>
              </div>
            ) : null}

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
                  💡 索取第 {hints.length + 1} 層提示
                </button>
              ) : null}
            </div>

            <p className="mission__meta">
              已完成 {completedCount} / {mastery.questionCount} 關・本關已嘗試{' '}
              {mastery.question.wrongAttempts} 次
            </p>
          </>
        )}
        <div className="mission__footer">
          <Link className="lobby-link" to="/app/missions">
            ← 回任務實戰
          </Link>
        </div>
      </Card>
    </section>
  );
}
