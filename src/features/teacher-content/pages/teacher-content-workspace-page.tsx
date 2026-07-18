import { useState } from 'react';

import type {
  QuestionDraftPayload,
  ReviewCardDraftPayload,
  TeacherCardRow,
  TeacherContentRepository,
  TeacherQuestionRow,
} from '../api/teacher-content-repository';
import {
  OPTION_KEYS,
  type QuestionFormValues,
  type ReviewCardFormValues,
} from '../components/content-form-validation';
import { QuestionEditorForm } from '../components/question-editor-form';
import { ReviewCardEditorForm } from '../components/review-card-editor-form';
import {
  useArchiveQuestion,
  useArchiveReviewCard,
  usePublishQuestion,
  usePublishReviewCard,
  useTeacherCards,
  useTeacherQuestions,
  useTeacherSubtopics,
  useUpsertQuestionDraft,
  useUpsertReviewCardDraft,
} from '../hooks/use-teacher-content';

const statusLabels = {
  archived: '已封存',
  draft: '草稿',
  published: '已發布',
} as const;

type EditorState =
  | Readonly<{ kind: 'card'; card: TeacherCardRow | null }>
  | Readonly<{ kind: 'question'; question: TeacherQuestionRow | null }>
  | null;

type PendingAction =
  | Readonly<{ type: 'archive-card'; cardId: string; label: string }>
  | Readonly<{ type: 'archive-question'; questionId: string; label: string }>
  | Readonly<{
      type: 'publish-card';
      cardId: string;
      label: string;
      payload: ReviewCardDraftPayload | null;
    }>
  | Readonly<{
      type: 'publish-question';
      questionId: string;
      label: string;
      payload: QuestionDraftPayload | null;
    }>;

const emptyQuestionForm = (): QuestionFormValues => ({
  explanation: '',
  options: OPTION_KEYS.map((key) => ({ isCorrect: false, key, text: '' })),
  prompt: '',
  stableCode: '',
  subtopicId: '',
});

const questionFormOf = (row: TeacherQuestionRow): QuestionFormValues => ({
  explanation: row.explanation,
  options: OPTION_KEYS.map((key) => {
    const found = row.options.find((option) => option.key === key);
    return {
      isCorrect: found?.isCorrect ?? false,
      key,
      text: found?.text ?? '',
    };
  }),
  prompt: row.prompt,
  stableCode: row.stableCode,
  subtopicId: row.subtopicId,
});

const emptyCardForm = (): ReviewCardFormValues => ({
  content: '',
  groupLabel: '',
  mediaAlt: '',
  mediaUrl: '',
  requiresRecompletion: false,
  stableCode: '',
  subtopicId: '',
  title: '',
});

const cardFormOf = (row: TeacherCardRow): ReviewCardFormValues => ({
  content: row.content,
  groupLabel: row.groupLabel,
  mediaAlt: row.media[0]?.altText ?? '',
  mediaUrl: row.media[0]?.assetPath ?? '',
  requiresRecompletion: row.requiresRecompletion,
  stableCode: row.stableCode,
  subtopicId: row.subtopicId,
  title: row.title,
});

export function TeacherContentWorkspacePage({
  repository,
}: Readonly<{ repository?: TeacherContentRepository }>) {
  const questions = useTeacherQuestions(repository);
  const cards = useTeacherCards(repository);
  const subtopics = useTeacherSubtopics(repository);
  const upsertQuestion = useUpsertQuestionDraft(repository);
  const publishQuestion = usePublishQuestion(repository);
  const archiveQuestion = useArchiveQuestion(repository);
  const upsertCard = useUpsertReviewCardDraft(repository);
  const publishCard = usePublishReviewCard(repository);
  const archiveCard = useArchiveReviewCard(repository);

  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const mutationPending =
    upsertQuestion.isPending ||
    publishQuestion.isPending ||
    archiveQuestion.isPending ||
    upsertCard.isPending ||
    publishCard.isPending ||
    archiveCard.isPending;

  const succeed = (message: string) => {
    setFeedback(message);
    setActionError(null);
    setEditor(null);
    setPending(null);
  };
  const fail = (error: Error) => {
    setActionError(error.message);
    setPending(null);
  };
  const publishFeedback = (
    receipt: Readonly<{ changed: boolean; version: number }>,
  ) =>
    receipt.changed
      ? `已發布第 ${String(receipt.version)} 版。`
      : `內容未變更，維持第 ${String(receipt.version)} 版。`;

  const confirmPending = (action: PendingAction) => {
    const requestId = crypto.randomUUID();
    if (action.type === 'publish-question') {
      publishQuestion.mutate(
        {
          payload: action.payload,
          questionId: action.questionId,
          requestId,
        },
        {
          onError: fail,
          onSuccess: (receipt) => {
            succeed(publishFeedback(receipt));
          },
        },
      );
      return;
    }
    if (action.type === 'publish-card') {
      publishCard.mutate(
        { cardId: action.cardId, payload: action.payload, requestId },
        {
          onError: fail,
          onSuccess: (receipt) => {
            succeed(publishFeedback(receipt));
          },
        },
      );
      return;
    }
    if (action.type === 'archive-question') {
      archiveQuestion.mutate(
        { questionId: action.questionId, requestId },
        {
          onError: fail,
          onSuccess: () => {
            succeed(`已封存「${action.label}」。`);
          },
        },
      );
      return;
    }
    archiveCard.mutate(
      { cardId: action.cardId, requestId },
      {
        onError: fail,
        onSuccess: () => {
          succeed(`已封存「${action.label}」。`);
        },
      },
    );
  };

  const submitQuestion = (payload: QuestionDraftPayload) => {
    const editing = editor?.kind === 'question' ? editor.question : null;
    if (editing?.status === 'published') {
      setPending({
        label: editing.stableCode,
        payload,
        questionId: editing.questionId,
        type: 'publish-question',
      });
      return;
    }
    upsertQuestion.mutate(
      { payload, requestId: crypto.randomUUID() },
      {
        onError: fail,
        onSuccess: () => {
          succeed('草稿已儲存。');
        },
      },
    );
  };

  const submitCard = (payload: ReviewCardDraftPayload) => {
    const editing = editor?.kind === 'card' ? editor.card : null;
    if (editing?.status === 'published') {
      setPending({
        cardId: editing.cardId,
        label: editing.title,
        payload,
        type: 'publish-card',
      });
      return;
    }
    upsertCard.mutate(
      { payload, requestId: crypto.randomUUID() },
      {
        onError: fail,
        onSuccess: () => {
          succeed('草稿已儲存。');
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="content-workspace-title"
      className="w-full max-w-5xl"
    >
      <header>
        <p className="route-panel__eyebrow">教師功能</p>
        <h1 id="content-workspace-title">內容工作區</h1>
        <p>
          草稿只有教師看得到；發布後才對學生生效，修改已發布內容會產生新版本，
          進行中的測驗仍使用其凍結版本。
        </p>
      </header>
      {feedback ? <p role="status">{feedback}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}

      <section aria-label="題庫管理">
        <h2>題庫</h2>
        <button
          onClick={() => {
            setEditor({ kind: 'question', question: null });
          }}
          type="button"
        >
          新增題目
        </button>
        {questions.isPending ? (
          <p role="status">題目載入中…</p>
        ) : questions.isError ? (
          <p role="alert">題目暫時無法載入，請稍後重試。</p>
        ) : questions.data.length === 0 ? (
          <p>目前沒有題目。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">題號</th>
                <th scope="col">題目</th>
                <th scope="col">狀態</th>
                <th scope="col">版本</th>
                <th scope="col">動作</th>
              </tr>
            </thead>
            <tbody>
              {questions.data.map((question) => (
                <tr key={question.questionId}>
                  <td>{question.stableCode}</td>
                  <td>{question.prompt}</td>
                  <td>{statusLabels[question.status]}</td>
                  <td>{`v${String(question.version)}`}</td>
                  <td>
                    {question.status === 'archived' ? null : (
                      <>
                        <button
                          onClick={() => {
                            setEditor({ kind: 'question', question });
                          }}
                          type="button"
                        >
                          編輯
                        </button>
                        {question.status === 'draft' ? (
                          <button
                            onClick={() => {
                              setPending({
                                label: question.stableCode,
                                payload: null,
                                questionId: question.questionId,
                                type: 'publish-question',
                              });
                            }}
                            type="button"
                          >
                            發布
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            setPending({
                              label: question.stableCode,
                              questionId: question.questionId,
                              type: 'archive-question',
                            });
                          }}
                          type="button"
                        >
                          封存
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editor?.kind === 'question' ? (
          <QuestionEditorForm
            heading={editor.question ? '編輯題目' : '新增題目草稿'}
            initial={
              editor.question
                ? questionFormOf(editor.question)
                : emptyQuestionForm()
            }
            key={editor.question?.questionId ?? 'new-question'}
            onCancel={() => {
              setEditor(null);
            }}
            onSubmit={submitQuestion}
            pending={mutationPending}
            submitLabel={
              editor.question?.status === 'published'
                ? '發布新版本'
                : '儲存草稿'
            }
            subtopics={subtopics.data ?? []}
          />
        ) : null}
      </section>

      <section aria-label="複習卡管理">
        <h2>複習卡</h2>
        <button
          onClick={() => {
            setEditor({ card: null, kind: 'card' });
          }}
          type="button"
        >
          新增複習卡
        </button>
        {cards.isPending ? (
          <p role="status">複習卡載入中…</p>
        ) : cards.isError ? (
          <p role="alert">複習卡暫時無法載入，請稍後重試。</p>
        ) : cards.data.length === 0 ? (
          <p>目前沒有複習卡。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">代碼</th>
                <th scope="col">標題</th>
                <th scope="col">狀態</th>
                <th scope="col">版本</th>
                <th scope="col">動作</th>
              </tr>
            </thead>
            <tbody>
              {cards.data.map((card) => (
                <tr key={card.cardId}>
                  <td>{card.stableCode}</td>
                  <td>{card.title}</td>
                  <td>{statusLabels[card.status]}</td>
                  <td>{`v${String(card.version)}`}</td>
                  <td>
                    {card.status === 'archived' ? null : (
                      <>
                        <button
                          onClick={() => {
                            setEditor({ card, kind: 'card' });
                          }}
                          type="button"
                        >
                          編輯
                        </button>
                        {card.status === 'draft' ? (
                          <button
                            onClick={() => {
                              setPending({
                                cardId: card.cardId,
                                label: card.title,
                                payload: null,
                                type: 'publish-card',
                              });
                            }}
                            type="button"
                          >
                            發布
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            setPending({
                              cardId: card.cardId,
                              label: card.title,
                              type: 'archive-card',
                            });
                          }}
                          type="button"
                        >
                          封存
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editor?.kind === 'card' ? (
          <ReviewCardEditorForm
            heading={editor.card ? '編輯複習卡' : '新增複習卡草稿'}
            initial={editor.card ? cardFormOf(editor.card) : emptyCardForm()}
            key={editor.card?.cardId ?? 'new-card'}
            onCancel={() => {
              setEditor(null);
            }}
            onSubmit={submitCard}
            pending={mutationPending}
            submitLabel={
              editor.card?.status === 'published' ? '發布新版本' : '儲存草稿'
            }
            subtopics={subtopics.data ?? []}
          />
        ) : null}
      </section>

      {pending ? (
        <div
          aria-labelledby="content-confirm-title"
          aria-modal="true"
          role="dialog"
        >
          <h2 id="content-confirm-title">
            {pending.type.startsWith('publish')
              ? `發布「${pending.label}」？`
              : `封存「${pending.label}」？`}
          </h2>
          <p>
            {pending.type.startsWith('publish')
              ? '發布後學生會立即看到這個版本；進行中的測驗仍使用其凍結版本。'
              : '封存後學生將看不到此內容，版本歷史會保留。'}
          </p>
          <button
            disabled={mutationPending}
            onClick={() => {
              confirmPending(pending);
            }}
            type="button"
          >
            {pending.type.startsWith('publish') ? '確認發布' : '確認封存'}
          </button>
          <button
            onClick={() => {
              setPending(null);
            }}
            type="button"
          >
            取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
