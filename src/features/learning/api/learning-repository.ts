import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

export type LearningErrorCode =
  | 'CHAPTER_LOCKED'
  | 'HINT_CLOSED'
  | 'HINT_SEQUENCE'
  | 'HINT_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'REMEDIATION_NOTHING_OPEN'
  | 'REVIEW_CARD_NOT_FOUND'
  | 'UNAVAILABLE';

const learningMessages: Record<LearningErrorCode, string> = {
  CHAPTER_LOCKED: '請先完成上一章的複習與挑戰。',
  HINT_CLOSED: '這一題已經作答，提示已關閉。',
  HINT_SEQUENCE: '請依序索取提示。',
  HINT_UNAVAILABLE: '這一題沒有更多提示了。',
  INVALID_RESPONSE: '學習資料格式不正確，請稍後重試。',
  REMEDIATION_NOTHING_OPEN: '這個小節目前沒有待補救的錯題。',
  REVIEW_CARD_NOT_FOUND: '找不到這張複習卡，或內容尚未發布。',
  UNAVAILABLE: '目前無法完成操作，請稍後重試。',
};

export class LearningError extends Error {
  readonly code: LearningErrorCode;

  constructor(code: LearningErrorCode) {
    super(learningMessages[code]);
    this.name = 'LearningError';
    this.code = code;
  }
}

const toLearningError = (message: string): LearningError => {
  const known: readonly LearningErrorCode[] = [
    'CHAPTER_LOCKED',
    'HINT_CLOSED',
    'HINT_SEQUENCE',
    'HINT_UNAVAILABLE',
    'REMEDIATION_NOTHING_OPEN',
    'REVIEW_CARD_NOT_FOUND',
  ];
  const match = known.find((code) => message.includes(code));
  return new LearningError(match ?? 'UNAVAILABLE');
};

const parseWith = <Output>(
  schema: z.ZodType<Output>,
  value: unknown,
): Output => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LearningError('INVALID_RESPONSE');
  return parsed.data;
};

const parsePrivateReviewMediaAssetPath = (
  assetPath: string,
): Readonly<{ bucket: string; objectPath: string }> => {
  const separator = assetPath.indexOf('/');
  if (separator <= 0 || separator === assetPath.length - 1) {
    throw new LearningError('INVALID_RESPONSE');
  }
  return {
    bucket: assetPath.slice(0, separator),
    objectPath: assetPath.slice(separator + 1),
  };
};

export const isDirectReviewMediaAssetPath = (assetPath: string): boolean =>
  assetPath.startsWith('/') || assetPath.startsWith('https://');

const trustedMediaPrefix = 'content-media:';

const parseTrustedMediaAssetId = (assetPath: string): string | null => {
  if (!assetPath.startsWith(trustedMediaPrefix)) return null;
  const parsed = uuidString.safeParse(
    assetPath.slice(trustedMediaPrefix.length),
  );
  if (!parsed.success) throw new LearningError('INVALID_RESPONSE');
  return parsed.data;
};

const trustedMediaResolutionSchema = z.object({
  action: z.literal('resolve'),
  assets: z.array(
    z.object({
      asset_id: uuidString,
      height: z.number().int().positive(),
      variants: z.array(
        z.object({
          height: z.number().int().positive(),
          kind: z.enum(['thumbnail', 'reading', 'color_critical']),
          mime_type: z.literal('image/webp'),
          url: z.url(),
          width: z.number().int().positive(),
        }),
      ),
      width: z.number().int().positive(),
    }),
  ),
  expires_at: z.iso.datetime(),
  outcome: z.literal('ok'),
});

const chapterReviewSchema = z.array(
  z.object({
    id: uuidString,
    quiz_template_id: uuidString.nullable(),
    sort_order: z.number().int().nonnegative(),
    stable_code: z.string().min(1),
    subtopics: z.array(
      z.object({
        id: uuidString,
        review_cards: z.array(
          z.object({
            content: z.string().min(1),
            group_label: z.string(),
            id: uuidString,
            requires_recompletion: z.boolean(),
            review_card_media: z.array(
              z.object({
                alt_text: z.string().min(1),
                asset_path: z.string().min(1),
                sort_order: z.number().int().nonnegative(),
              }),
            ),
            sort_order: z.number().int().nonnegative(),
            title: z.string().min(1),
            version: z.number().int().positive(),
          }),
        ),
        sort_order: z.number().int().nonnegative(),
        stable_code: z.string().min(1),
        title: z.string().min(1),
      }),
    ),
    title: z.string().min(1),
  }),
);

const reviewProgressRowsSchema = z.array(
  z.object({
    card_version: z.number().int().positive(),
    review_card_id: uuidString,
  }),
);

const progressRowsSchema = z.array(
  z.object({
    accuracy: z.number().nullable(),
    chapter_id: uuidString,
    coverage: z.number().nullable(),
    mastery: z.number().nullable(),
    review_completed: z.number().int().nonnegative(),
    review_total: z.number().int().positive().nullable(),
    rules_version: z.string().min(1),
    scope: z.enum(['chapter', 'subtopic']),
    status: z.enum(['not_started', 'learning', 'developing', 'mastered']),
    subtopic_id: uuidString.nullable(),
  }),
);

const mistakeRowsSchema = z.array(
  z.object({
    correct_option_text: z.string().min(1),
    last_event_at: z.string().min(1),
    mistake_id: uuidString,
    prompt: z.string().min(1),
    stable_code: z.string().min(1),
    status: z.enum(['open', 'resolved', 'reopened']),
    subtopic_id: uuidString,
    subtopic_title: z.string().min(1),
  }),
);

const hintSchema = z.object({
  content: z.string().min(1),
  hint_level: z.number().int().min(1).max(3),
  question_version: z.number().int().positive(),
});

const remediationStartSchema = z.object({ session_id: uuidString }).loose();

const classroomProgressSchema = z.array(
  z.object({
    chapter_id: uuidString,
    display_name: z.string().min(1),
    mastery: z.number().nullable(),
    rules_version: z.string().min(1),
    status: z.enum(['not_started', 'learning', 'developing', 'mastered']),
    user_id: uuidString,
  }),
);

export type ReviewCardView = Readonly<{
  cardId: string;
  content: string;
  groupLabel: string;
  media: readonly Readonly<{ altText: string; assetPath: string }>[];
  requiresRecompletion: boolean;
  sortOrder: number;
  title: string;
  version: number;
}>;

export type ReviewMediaResolution = Readonly<{
  assetPath: string;
  height?: number;
  resolvedUrl: string | null;
  sizes?: string;
  srcSet?: string;
  width?: number;
}>;

export type ChapterReviewSubtopic = Readonly<{
  cards: readonly ReviewCardView[];
  sortOrder: number;
  stableCode: string;
  subtopicId: string;
  title: string;
}>;

export type ChapterReviewSection = Readonly<{
  quizTemplateId: string | null;
  sectionId: string;
  sortOrder: number;
  stableCode: string;
  subtopics: readonly ChapterReviewSubtopic[];
  title: string;
}>;

export type ReviewCompletionRow = Readonly<{
  cardVersion: number;
  reviewCardId: string;
}>;

export type LearningProgressRow = Readonly<{
  accuracy: number | null;
  chapterId: string;
  coverage: number | null;
  mastery: number | null;
  reviewCompleted: number;
  reviewTotal: number | null;
  rulesVersion: string;
  scope: 'chapter' | 'subtopic';
  status: 'not_started' | 'learning' | 'developing' | 'mastered';
  subtopicId: string | null;
}>;

export type MistakeView = Readonly<{
  correctOptionText: string;
  lastEventAt: string;
  mistakeId: string;
  prompt: string;
  stableCode: string;
  status: 'open' | 'resolved' | 'reopened';
  subtopicId: string;
  subtopicTitle: string;
}>;

export type QuestionHintView = Readonly<{
  content: string;
  hintLevel: number;
  questionVersion: number;
}>;

export type ClassroomProgressRow = Readonly<{
  chapterId: string;
  displayName: string;
  mastery: number | null;
  status: 'not_started' | 'learning' | 'developing' | 'mastered';
  userId: string;
}>;

export type LearningRepository = Readonly<{
  completeReviewCard(
    input: Readonly<{
      requestId: string;
      reviewCardId: string;
    }>,
  ): Promise<void>;
  getClassroomProgress(
    classroomId: string,
  ): Promise<readonly ClassroomProgressRow[]>;
  getLearningProgress(
    chapterId: string | null,
  ): Promise<readonly LearningProgressRow[]>;
  listChapterReview(
    chapterId: string,
  ): Promise<readonly ChapterReviewSection[]>;
  listMistakes(): Promise<readonly MistakeView[]>;
  listReviewProgress(): Promise<readonly ReviewCompletionRow[]>;
  requestHint(
    input: Readonly<{
      hintLevel: number;
      sessionQuestionId: string;
    }>,
  ): Promise<QuestionHintView>;
  resolveReviewMedia(
    assetPaths: readonly string[],
  ): Promise<readonly ReviewMediaResolution[]>;
  startRemediation(
    input: Readonly<{
      requestId: string;
      subtopicId: string;
    }>,
  ): Promise<string>;
}>;

export function createLearningRepository(
  client: SupabaseClient<Database>,
): LearningRepository {
  return {
    async completeReviewCard(input) {
      const { error } = await client.rpc('complete_review_card', {
        p_request_id: input.requestId,
        p_review_card_id: input.reviewCardId,
      });
      if (error) throw toLearningError(error.message);
    },

    async getClassroomProgress(classroomId) {
      const { data, error } = await client.rpc('get_classroom_progress', {
        p_classroom_id: classroomId,
      });
      if (error) throw toLearningError(error.message);
      return parseWith(classroomProgressSchema, data).map((row) => ({
        chapterId: row.chapter_id,
        displayName: row.display_name,
        mastery: row.mastery,
        status: row.status,
        userId: row.user_id,
      }));
    },

    async getLearningProgress(chapterId) {
      const { data, error } = await client.rpc(
        'get_learning_progress',
        chapterId ? { p_chapter_id: chapterId } : {},
      );
      if (error) throw toLearningError(error.message);
      return parseWith(progressRowsSchema, data).map((row) => ({
        accuracy: row.accuracy,
        chapterId: row.chapter_id,
        coverage: row.coverage,
        mastery: row.mastery,
        reviewCompleted: row.review_completed,
        reviewTotal: row.review_total,
        rulesVersion: row.rules_version,
        scope: row.scope,
        status: row.status,
        subtopicId: row.subtopic_id,
      }));
    },

    async listChapterReview(chapterId) {
      const { data, error } = await client.rpc(
        'get_accessible_chapter_review',
        { p_chapter_id: chapterId },
      );
      if (error) throw toLearningError(error.message);
      const sections = parseWith(chapterReviewSchema, data);
      return sections.map((section) => ({
        quizTemplateId: section.quiz_template_id,
        sectionId: section.id,
        sortOrder: section.sort_order,
        stableCode: section.stable_code,
        subtopics: [...section.subtopics]
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((subtopic) => ({
            cards: [...subtopic.review_cards]
              .sort((left, right) => left.sort_order - right.sort_order)
              .map((card) => ({
                cardId: card.id,
                content: card.content,
                groupLabel: card.group_label,
                media: [...card.review_card_media]
                  .sort((left, right) => left.sort_order - right.sort_order)
                  .map((media) => ({
                    altText: media.alt_text,
                    assetPath: media.asset_path,
                  })),
                requiresRecompletion: card.requires_recompletion,
                sortOrder: card.sort_order,
                title: card.title,
                version: card.version,
              })),
            sortOrder: subtopic.sort_order,
            stableCode: subtopic.stable_code,
            subtopicId: subtopic.id,
            title: subtopic.title,
          })),
        title: section.title,
      }));
    },

    async listMistakes() {
      const { data, error } = await client.rpc('list_my_mistakes');
      if (error) throw toLearningError(error.message);
      return parseWith(mistakeRowsSchema, data).map((row) => ({
        correctOptionText: row.correct_option_text,
        lastEventAt: row.last_event_at,
        mistakeId: row.mistake_id,
        prompt: row.prompt,
        stableCode: row.stable_code,
        status: row.status,
        subtopicId: row.subtopic_id,
        subtopicTitle: row.subtopic_title,
      }));
    },

    async listReviewProgress() {
      const { data, error } = await client
        .from('review_progress')
        .select('review_card_id, card_version');
      if (error) throw toLearningError(error.message);
      return parseWith(reviewProgressRowsSchema, data).map((row) => ({
        cardVersion: row.card_version,
        reviewCardId: row.review_card_id,
      }));
    },

    async requestHint(input) {
      const { data, error } = await client.rpc('request_question_hint', {
        p_hint_level: input.hintLevel,
        p_session_question_id: input.sessionQuestionId,
      });
      if (error) throw toLearningError(error.message);
      const hint = parseWith(hintSchema, data);
      return {
        content: hint.content,
        hintLevel: hint.hint_level,
        questionVersion: hint.question_version,
      };
    },

    async resolveReviewMedia(assetPaths) {
      const resolutions = new Map<string, ReviewMediaResolution>();
      const pathsByBucket = new Map<string, Set<string>>();
      const trustedAssetPaths = new Map<string, string>();

      for (const assetPath of assetPaths) {
        if (isDirectReviewMediaAssetPath(assetPath)) {
          resolutions.set(assetPath, { assetPath, resolvedUrl: assetPath });
          continue;
        }
        const trustedAssetId = parseTrustedMediaAssetId(assetPath);
        if (trustedAssetId !== null) {
          trustedAssetPaths.set(trustedAssetId, assetPath);
          continue;
        }
        const { bucket, objectPath } =
          parsePrivateReviewMediaAssetPath(assetPath);
        const bucketPaths = pathsByBucket.get(bucket) ?? new Set<string>();
        bucketPaths.add(objectPath);
        pathsByBucket.set(bucket, bucketPaths);
      }

      await Promise.all(
        [...pathsByBucket].map(async ([bucket, objectPaths]) => {
          const paths = [...objectPaths];
          const { data, error } = await client.storage
            .from(bucket)
            .createSignedUrls(paths, 3600);
          if (error) throw new LearningError('UNAVAILABLE');

          const signedUrlByPath = new Map(
            data.map((item) => [item.path, item.error ? null : item.signedUrl]),
          );
          for (const objectPath of paths) {
            const assetPath = `${bucket}/${objectPath}`;
            resolutions.set(assetPath, {
              assetPath,
              resolvedUrl: signedUrlByPath.get(objectPath) ?? null,
            });
          }
        }),
      );

      const trustedAssetIds = [...trustedAssetPaths.keys()];
      for (let offset = 0; offset < trustedAssetIds.length; offset += 6) {
        const assetIds = trustedAssetIds.slice(offset, offset + 6);
        const invocation = (await client.functions.invoke('content-media', {
          body: { action: 'resolve', assetIds },
        })) as Readonly<{ data: unknown; error: unknown }>;
        if (invocation.error) throw new LearningError('UNAVAILABLE');
        const payload = parseWith(
          trustedMediaResolutionSchema,
          invocation.data,
        );
        const returnedIds = new Set(
          payload.assets.map((asset) => asset.asset_id),
        );
        if (assetIds.some((assetId) => !returnedIds.has(assetId))) {
          throw new LearningError('INVALID_RESPONSE');
        }
        for (const asset of payload.assets) {
          const assetPath = trustedAssetPaths.get(asset.asset_id);
          if (assetPath === undefined)
            throw new LearningError('INVALID_RESPONSE');
          const variants = [...asset.variants].sort(
            (left, right) => left.width - right.width,
          );
          const fallback =
            variants.find((variant) => variant.kind === 'color_critical') ??
            variants.find((variant) => variant.kind === 'reading') ??
            variants.at(-1);
          if (fallback === undefined)
            throw new LearningError('INVALID_RESPONSE');
          resolutions.set(assetPath, {
            assetPath,
            height: asset.height,
            resolvedUrl: fallback.url,
            sizes: '(max-width: 640px) 100vw, 800px',
            srcSet: variants
              .map((variant) => `${variant.url} ${String(variant.width)}w`)
              .join(', '),
            width: asset.width,
          });
        }
      }

      return assetPaths.map(
        (assetPath) =>
          resolutions.get(assetPath) ?? { assetPath, resolvedUrl: null },
      );
    },

    async startRemediation(input) {
      const { data, error } = await client.rpc('start_remediation_session', {
        p_request_id: input.requestId,
        p_subtopic_id: input.subtopicId,
      });
      if (error) throw toLearningError(error.message);
      return parseWith(remediationStartSchema, data).session_id;
    },
  };
}
