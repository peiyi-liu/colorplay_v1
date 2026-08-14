import { Fragment, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import type { ClassroomRepository } from '../../classrooms/types';
import type {
  AssessmentQuestionRow,
  TeacherContentRepository,
} from '../api/teacher-content-repository';
import { AuthenticatedTeacherMenu } from '../components/authenticated-teacher-menu';
import { TeacherWorkSurface } from '../components/teacher-work-surface';
import {
  useTeacherAssessmentQuestions,
  useTeacherQuestionAnswer,
  useTeacherQuestionDetail,
} from '../hooks/use-teacher-content';
import { formatPercent } from '../lib/teacher-analytics-format';
import '../teacher-workspace.css';
import '../teacher-workspace-mobile.css';
import '../teacher-analytics.css';
import '../teacher-analytics-data.css';
import '../teacher-analytics-mobile.css';
import '../teacher-questions-reimplementation.css';

type SectionGroup = Readonly<{
  chapterId: string;
  chapterSortOrder: number;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
  rows: readonly AssessmentQuestionRow[];
}>;

const groupRows = (
  rows: readonly AssessmentQuestionRow[],
): readonly SectionGroup[] => {
  const groups = new Map<string, SectionGroup>();
  for (const row of rows) {
    const current = groups.get(row.section_id);
    const sortedRows = [...(current?.rows ?? []), row].sort(
      (left, right) =>
        (left.correct_rate ?? 100) - (right.correct_rate ?? 100) ||
        left.stable_code.localeCompare(right.stable_code),
    );
    groups.set(row.section_id, {
      chapterId: row.chapter_id,
      chapterSortOrder: row.chapter_sort_order,
      chapterTitle: row.chapter_title,
      rows: sortedRows,
      sectionId: row.section_id,
      sectionTitle: row.section_title,
    });
  }
  return [...groups.values()];
};

export function TeacherQuestionAnalysisPage({
  classroomRepository,
  menu,
  repository,
}: Readonly<{
  classroomRepository?: ClassroomRepository;
  menu?: ReactNode;
  repository?: TeacherContentRepository;
}>) {
  const [searchParams] = useSearchParams();
  const classrooms = useOwnedClassrooms(classroomRepository);
  const requested = searchParams.get('classroomId') ?? '';
  const classroomId = classrooms.data?.some(
    (row) => row.classroomId === requested,
  )
    ? requested
    : (classrooms.data?.[0]?.classroomId ?? '');
  const questions = useTeacherAssessmentQuestions(
    classroomId,
    {},
    'section_quiz',
    repository,
  );
  const [selectedCode, setSelectedCode] = useState('');
  const [sectionOpen, setSectionOpen] = useState<
    Readonly<Record<string, boolean>>
  >({});
  const detail = useTeacherQuestionDetail(
    classroomId,
    selectedCode,
    repository,
  );
  const answer = useTeacherQuestionAnswer(
    classroomId,
    selectedCode,
    'section_quiz',
    null,
    repository,
  );

  const renderOptions = () => {
    if (!detail.data) return null;
    const authoritative = new Map(
      (answer.data?.options ?? []).map((option) => [option.key, option]),
    );
    return (
      <ol className="teacher-question-options">
        {detail.data.options.map((option) => {
          const ownerOption = authoritative.get(option.option_key);
          const isCorrect = ownerOption?.isCorrect === true;
          return (
            <li
              className={
                isCorrect ? 'teacher-question-options__correct' : undefined
              }
              key={option.option_key}
            >
              <span>
                {option.option_key}．{option.option_text}
              </span>
              {isCorrect ? <strong>✓ 正確答案</strong> : null}
            </li>
          );
        })}
      </ol>
    );
  };

  const state =
    classrooms.isPending || questions.isPending
      ? ({ kind: 'loading', message: '題目分析載入中…' } as const)
      : classrooms.isError || questions.isError
        ? ({ kind: 'error', message: '題目分析暫時無法取得。' } as const)
        : questions.data.length === 0
          ? ({ kind: 'empty', message: '目前沒有小節測驗作答資料。' } as const)
          : ({ kind: 'content' } as const);

  const groups = groupRows(questions.data ?? []);
  const chapters = new Map<string, SectionGroup[]>();
  for (const group of groups) {
    chapters.set(group.chapterId, [
      ...(chapters.get(group.chapterId) ?? []),
      group,
    ]);
  }

  return (
    <TeacherWorkSurface
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={state}
      title="題目分析"
      variant="analytics"
    >
      <div className="teacher-question-drilldown">
        {[...chapters.entries()].map(([chapterId, sections]) => (
          <section key={chapterId}>
            <h2>
              第 {sections[0]?.chapterSortOrder} 章 {sections[0]?.chapterTitle}
            </h2>
            {sections.map((section, sectionIndex) => (
              <details
                key={section.sectionId}
                onToggle={(event) => {
                  const nextOpen = event.currentTarget.open;
                  setSectionOpen((current) =>
                    current[section.sectionId] === nextOpen
                      ? current
                      : { ...current, [section.sectionId]: nextOpen },
                  );
                }}
                open={sectionOpen[section.sectionId] ?? sectionIndex === 0}
              >
                <summary>{section.sectionTitle}</summary>
                <div className="teacher-table-frame">
                  <table
                    aria-label={`${section.sectionTitle}題目分析`}
                    className="ui-table"
                  >
                    <thead>
                      <tr>
                        <th scope="col">順序</th>
                        <th scope="col">序號</th>
                        <th scope="col">題目</th>
                        <th scope="col">錯誤率</th>
                        <th scope="col">題目內容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, index) => (
                        <Fragment key={row.stable_code}>
                          <tr>
                            <td>{index + 1}</td>
                            <td>{row.stable_code}</td>
                            <td>{row.prompt}</td>
                            <td>
                              {formatPercent(100 - (row.correct_rate ?? 0))}
                            </td>
                            <td>
                              <button
                                aria-expanded={selectedCode === row.stable_code}
                                aria-label={`查看 ${row.stable_code} 題目內容`}
                                onClick={() => {
                                  setSelectedCode((current) =>
                                    current === row.stable_code
                                      ? ''
                                      : row.stable_code,
                                  );
                                }}
                                type="button"
                              >
                                {selectedCode === row.stable_code
                                  ? '收合'
                                  : '查看'}
                              </button>
                            </td>
                          </tr>
                          {selectedCode === row.stable_code ? (
                            <tr>
                              <td colSpan={5}>
                                {detail.isPending ? (
                                  <p role="status">題目內容載入中…</p>
                                ) : detail.isError ? (
                                  <p role="alert">題目內容暫時無法取得。</p>
                                ) : detail.data ? (
                                  renderOptions()
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="teacher-question-mobile-rows">
                  {section.rows.map((row, index) => (
                    <article key={row.stable_code}>
                      <div>
                        <strong>
                          {index + 1}．{row.stable_code}
                        </strong>
                        <span>
                          錯誤率 {formatPercent(100 - (row.correct_rate ?? 0))}
                        </span>
                      </div>
                      <p>{row.prompt}</p>
                      <button
                        aria-expanded={selectedCode === row.stable_code}
                        aria-label={`查看 ${row.stable_code} 題目內容（手機）`}
                        onClick={() => {
                          setSelectedCode((current) =>
                            current === row.stable_code ? '' : row.stable_code,
                          );
                        }}
                        type="button"
                      >
                        {selectedCode === row.stable_code ? '收合' : '查看'}
                      </button>
                      {selectedCode === row.stable_code ? (
                        detail.isPending ? (
                          <p role="status">題目內容載入中…</p>
                        ) : detail.isError ? (
                          <p role="alert">題目內容暫時無法取得。</p>
                        ) : detail.data ? (
                          renderOptions()
                        ) : null
                      ) : null}
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </section>
        ))}
      </div>
    </TeacherWorkSurface>
  );
}
