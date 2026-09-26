import { z } from 'zod';

import type {
  ContentEditorState,
  ContentEntityType,
  ContentScope,
} from '../api/contracts';
import {
  CONTENT_ENTITY_LABELS,
  type ContentStudioItem,
} from '../lib/content-studio-model';

export const mediaEntrySchema = z.object({
  alt_text: z.string().trim().min(1).max(200),
  manifest_id: z.string().min(1),
  semantic_role: z.enum(['standard', 'color_critical']),
  sort_order: z.number().int().nonnegative(),
});

export const editorSchema = z.object({
  bankId: z.string(),
  chapterId: z.string(),
  content: z.string().max(5000),
  correctAnswer: z.enum(['A', 'B', 'C', 'D']),
  description: z.string().max(1000),
  durationSeconds: z.number().int().min(5).max(120),
  explanation: z.string().max(2000),
  groupLabel: z.string().max(120),
  kind: z.enum(['QB', 'CR', 'LT']),
  media: z.array(mediaEntrySchema).max(3),
  optionA: z.string().max(500),
  optionB: z.string().max(500),
  optionC: z.string().max(500),
  optionD: z.string().max(500),
  parentId: z.string(),
  prompt: z.string().max(1000),
  sectionId: z.string(),
  sortOrder: z.number().int().nonnegative(),
  stableCode: z.string().trim().min(1).max(200),
  subtopicId: z.string(),
  title: z.string().max(100),
});

export type EditorValues = z.infer<typeof editorSchema>;
export const ENTITY_TYPES = Object.keys(
  CONTENT_ENTITY_LABELS,
) as ContentEntityType[];

function stringValue(payload: Readonly<Record<string, unknown>>, key: string) {
  return typeof payload[key] === 'string' ? payload[key] : '';
}

function firstNonBlank(
  ...values: readonly (string | null | undefined)[]
): string {
  return (
    values.find((value) => typeof value === 'string' && value.length > 0) ?? ''
  );
}

export function valuesFromState(
  item: ContentStudioItem,
  state: ContentEditorState | null,
  scope: ContentScope,
): EditorValues {
  const payload = state?.draft?.payload ?? state?.current?.payload ?? {};
  const options = Array.isArray(payload.options)
    ? (payload.options as Record<string, unknown>[])
    : [];
  const optionText = (key: string) => {
    const value = options.find((option) => option.key === key)?.text;
    return typeof value === 'string' ? value : '';
  };
  const correct = options.find((option) => option.is_correct === true)?.key;
  const firstSection = scope.sections[0];
  const sectionId = firstNonBlank(
    stringValue(payload, 'section_id'),
    item.sectionId,
    firstSection?.sectionId,
  );
  const firstSubtopic = scope.sections
    .find((section) => section.sectionId === sectionId)
    ?.subtopics.at(0);
  const kind =
    payload.kind === 'CR' || payload.kind === 'LT' || payload.kind === 'QB'
      ? payload.kind
      : (item.bankKind ?? 'QB');
  const allBanks = [
    ...scope.chapterBanks,
    ...scope.sections.flatMap((section) => section.banks),
  ];
  return {
    bankId: firstNonBlank(
      stringValue(payload, 'bank_id'),
      item.entityType === 'question' ? item.parentId : '',
      allBanks.find((bank) => bank.kind === kind)?.bankId,
    ),
    chapterId: firstNonBlank(
      stringValue(payload, 'chapter_id'),
      item.chapterId,
      scope.chapter.chapterId,
    ),
    content: stringValue(payload, 'content'),
    correctAnswer:
      correct === 'A' || correct === 'B' || correct === 'C' || correct === 'D'
        ? correct
        : 'A',
    description: stringValue(payload, 'description'),
    durationSeconds:
      typeof payload.duration_seconds === 'number'
        ? payload.duration_seconds
        : 20,
    explanation: stringValue(payload, 'explanation'),
    groupLabel: stringValue(payload, 'group_label'),
    kind,
    media: (() => {
      const parsed = z.array(mediaEntrySchema).safeParse(payload.media);
      return parsed.success ? parsed.data : [];
    })(),
    optionA: optionText('A'),
    optionB: optionText('B'),
    optionC: optionText('C'),
    optionD: optionText('D'),
    parentId: firstNonBlank(
      stringValue(payload, 'course_id'),
      stringValue(payload, 'chapter_id'),
      stringValue(payload, 'section_id'),
      stringValue(payload, 'subtopic_id'),
      stringValue(payload, 'bank_id'),
      item.parentId,
    ),
    prompt: stringValue(payload, 'prompt'),
    sectionId,
    sortOrder: typeof payload.sort_order === 'number' ? payload.sort_order : 1,
    stableCode: state?.draft?.stableCode ?? state?.current?.stableCode ?? '',
    subtopicId: firstNonBlank(
      stringValue(payload, 'subtopic_id'),
      item.subtopicId,
      firstSubtopic?.subtopicId,
    ),
    title: firstNonBlank(
      stringValue(payload, 'title'),
      item.entityId ? item.title : '',
    ),
  };
}

export function payloadFromValues(
  entityType: ContentEntityType,
  values: EditorValues,
): Readonly<Record<string, unknown>> {
  const structural = { sort_order: values.sortOrder, title: values.title };
  switch (entityType) {
    case 'course':
      return { ...structural, description: values.description };
    case 'chapter':
      return {
        ...structural,
        course_id: values.parentId,
        description: values.description,
      };
    case 'section':
      return {
        ...structural,
        chapter_id: values.chapterId,
        description: values.description,
      };
    case 'subtopic':
      return {
        ...structural,
        section_id: values.sectionId,
        description: values.description,
      };
    case 'review_card':
      return {
        content: values.content,
        group_label: values.groupLabel,
        media: values.media,
        sort_order: values.sortOrder,
        subtopic_id: values.subtopicId,
        title: values.title,
      };
    case 'assessment_bank':
      return {
        ...(values.kind === 'CR'
          ? { chapter_id: values.chapterId }
          : { section_id: values.sectionId }),
        description: values.description,
        kind: values.kind,
        selection_settings: {},
        sort_order: values.sortOrder,
        title: values.title,
      };
    case 'question':
      return {
        bank_id: values.bankId,
        duration_seconds: values.durationSeconds,
        explanation: values.explanation,
        options: (['A', 'B', 'C', 'D'] as const).map((key, index) => ({
          is_correct: values.correctAnswer === key,
          key,
          sort_order: index + 1,
          text: values[`option${key}`],
        })),
        prompt: values.prompt,
        question_type: 'single_choice',
        sort_order: values.sortOrder,
      };
  }
}

export function nextStableCode(
  entityType: ContentEntityType,
  values: EditorValues,
  scope: ContentScope,
  items: readonly ContentStudioItem[],
): string {
  const chapterNumber = scope.chapter.sortOrder;
  const section = scope.sections.find(
    (entry) => entry.sectionId === values.sectionId,
  );
  const sectionNumber = section?.sortOrder ?? 1;
  const chapterCode = String(chapterNumber);
  const sectionCode = String(sectionNumber);
  const orderCode = String(Math.max(1, values.sortOrder));
  const countFor = (predicate: (item: ContentStudioItem) => boolean) =>
    items.filter(predicate).length + 1;
  switch (entityType) {
    case 'course':
      return `course-${orderCode}`;
    case 'chapter':
      return `chapter-${orderCode}`;
    case 'section':
      return `section-${chapterCode}-${orderCode}`;
    case 'subtopic':
      return `subtopic-${chapterCode}-${sectionCode}-${orderCode}`;
    case 'review_card': {
      const sequence = countFor(
        (entry) =>
          entry.entityType === 'review_card' &&
          entry.subtopicId === values.subtopicId,
      );
      return `RC${chapterCode}${sectionCode}${String(sequence).padStart(2, '0')}`;
    }
    case 'assessment_bank':
      return values.kind === 'CR'
        ? `CR-chapter-${chapterCode}`
        : `${values.kind}-section-${chapterCode}-${sectionCode}`;
    case 'question': {
      const bank = items.find(
        (entry) =>
          entry.entityType === 'assessment_bank' &&
          entry.entityId === values.bankId,
      );
      const kind = bank?.bankKind ?? values.kind;
      const sequence = countFor(
        (entry) =>
          entry.entityType === 'question' && entry.parentId === values.bankId,
      );
      return kind === 'CR'
        ? `CR${chapterCode}${String(sequence).padStart(3, '0')}`
        : `${kind}${chapterCode}${sectionCode}${String(sequence).padStart(2, '0')}`;
    }
  }
}
