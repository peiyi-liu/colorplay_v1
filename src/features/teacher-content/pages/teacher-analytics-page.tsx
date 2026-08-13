import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useStageWide } from '../../../components/ui/game-pager';
import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import type { ClassroomRepository } from '../../classrooms/types';
import { usePublishedChapters } from '../../learning/api/chapters';
import type {
  AnalyticsFilters,
  AssessmentSource,
  DateRangeFilters,
  TeacherContentRepository,
} from '../api/teacher-content-repository';
import { AuthenticatedTeacherMenu } from '../components/authenticated-teacher-menu';
import {
  ClassroomOverviewPanel,
  LiveHistoryPanel,
  QuestionInsightPanel,
} from '../components/teacher-analytics-v2-panels';
import { TeacherWorkSurface } from '../components/teacher-work-surface';
import {
  useTeacherAssessmentQuestions,
  useTeacherChapterCompletion,
  useTeacherClassroomOverview,
  useTeacherLiveHistory,
} from '../hooks/use-teacher-content';
import '../teacher-workspace.css';
import '../teacher-workspace-mobile.css';
import '../teacher-analytics.css';
import '../teacher-analytics-data.css';
import '../teacher-analytics-mobile.css';

const sourceOptions: readonly Readonly<{
  label: string;
  value: AssessmentSource;
}>[] = [
  { label: '全部', value: 'all' },
  { label: '小節測驗', value: 'section_quiz' },
  { label: '章節總測驗', value: 'chapter_quiz' },
  { label: 'Live 課堂', value: 'live' },
];

type TeacherAnalyticsPageProps = Readonly<{
  classroomRepository?: ClassroomRepository;
  menu?: ReactNode;
  repository?: TeacherContentRepository;
}>;

function AnalyticsRegionState({
  kind,
  label,
  onRetry,
}: Readonly<{
  kind: 'error' | 'loading';
  label: string;
  onRetry?: () => void;
}>) {
  if (kind === 'loading') {
    return <p role="status">{label}載入中…</p>;
  }
  return (
    <div className="teacher-analytics-region-error" role="alert">
      <p>{label}暫時無法取得。</p>
      {onRetry ? (
        <button onClick={onRetry} type="button">
          重新載入{label}
        </button>
      ) : null}
    </div>
  );
}

function TeacherAnalyticsPageContent({
  classroomRepository,
  menu,
  repository,
}: TeacherAnalyticsPageProps) {
  const classrooms = useOwnedClassrooms(classroomRepository);
  const chapters = usePublishedChapters();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [source, setSource] = useState<AssessmentSource>('all');
  const [livePage, setLivePage] = useState(1);
  const wide = useStageWide();
  const requestedClassroomId = searchParams.get('classroomId') ?? '';
  const classroomId = classrooms.data?.some(
    (classroom) => classroom.classroomId === requestedClassroomId,
  )
    ? requestedClassroomId
    : (classrooms.data?.[0]?.classroomId ?? '');
  const selectedClassroomName =
    classrooms.data?.find((classroom) => classroom.classroomId === classroomId)
      ?.classroomName ?? '尚未選擇班級';
  const selectedChapterName =
    (chapters.data ?? []).find((chapter) => chapter.id === chapterId)?.title ??
    '全部章節';

  useEffect(() => {
    if (!classroomId || requestedClassroomId === classroomId) return;
    setSearchParams({ classroomId }, { replace: true });
  }, [classroomId, requestedClassroomId, setSearchParams]);

  const dateFilters: DateRangeFilters = {
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  };
  const filters: AnalyticsFilters = {
    ...(chapterId ? { chapterId } : {}),
    ...dateFilters,
  };
  const overview = useTeacherClassroomOverview(
    classroomId,
    filters,
    repository,
  );
  const completion = useTeacherChapterCompletion(
    classroomId,
    chapterId || null,
    repository,
  );
  const questions = useTeacherAssessmentQuestions(
    classroomId,
    filters,
    source,
    repository,
  );
  const liveHistory = useTeacherLiveHistory(
    classroomId,
    dateFilters,
    livePage,
    repository,
  );

  const workSurfaceState = classrooms.isPending
    ? ({ kind: 'loading', message: '班級資料載入中…' } as const)
    : classrooms.isError
      ? ({ kind: 'error', message: '班級資料暫時無法取得。' } as const)
      : classrooms.data.length === 0
        ? ({ kind: 'empty', message: '尚未建立班級。' } as const)
        : ({ kind: 'content' } as const);

  return (
    <TeacherWorkSurface
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={workSurfaceState}
      title="教學分析"
      variant="analytics"
    >
      <details className="teacher-analytics-filter-deck" open={wide || undefined}>
        <summary>
          <span>分析篩選</span>
          <small>
            {selectedClassroomName} · {selectedChapterName}
          </small>
        </summary>
        <form aria-label="分析篩選" className="teacher-analytics-filters">
          <div data-active={requestedClassroomId.length > 0}>
            <label htmlFor="analytics-classroom">選擇班級</label>
            <select
              id="analytics-classroom"
              onChange={(event) => {
                setLivePage(1);
                setSearchParams({ classroomId: event.target.value });
              }}
              value={classroomId}
            >
              {classrooms.data?.map((classroom) => (
                <option
                  key={classroom.classroomId}
                  value={classroom.classroomId}
                >
                  {classroom.classroomName}
                </option>
              ))}
            </select>
          </div>
          <div data-active={fromDate.length > 0}>
            <label htmlFor="analytics-from">開始日期</label>
            <input
              id="analytics-from"
              onChange={(event) => {
                setLivePage(1);
                setFromDate(event.target.value);
              }}
              type="date"
              value={fromDate}
            />
          </div>
          <div data-active={toDate.length > 0}>
            <label htmlFor="analytics-to">結束日期</label>
            <input
              id="analytics-to"
              onChange={(event) => {
                setLivePage(1);
                setToDate(event.target.value);
              }}
              type="date"
              value={toDate}
            />
          </div>
          <div data-active={chapterId.length > 0}>
            <label htmlFor="analytics-chapter">章節</label>
            <select
              id="analytics-chapter"
              onChange={(event) => {
                setChapterId(event.target.value);
              }}
              value={chapterId}
            >
              <option value="">全部章節</option>
              {(chapters.data ?? []).map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </div>
        </form>
      </details>

      {overview.isPending ? (
        <AnalyticsRegionState kind="loading" label="班級總覽" />
      ) : overview.isError ? (
        <AnalyticsRegionState
          kind="error"
          label="班級總覽"
          onRetry={() => {
            void overview.refetch();
          }}
        />
      ) : (
        <ClassroomOverviewPanel
          classroomName={selectedClassroomName}
          overview={overview.data ?? null}
        />
      )}

      <div className="teacher-analytics-decision-layout">
        <div className="teacher-analytics-decision-layout__primary">
          <div
            aria-label="題目來源"
            className="teacher-assessment-source-tabs"
            role="group"
          >
            {sourceOptions.map((option) => (
              <button
                aria-pressed={source === option.value}
                key={option.value}
                onClick={() => {
                  setSource(option.value);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {questions.isPending || completion.isPending ? (
            <AnalyticsRegionState kind="loading" label="題目分析" />
          ) : questions.isError || completion.isError ? (
            <AnalyticsRegionState
              kind="error"
              label="題目分析"
              onRetry={() => {
                void Promise.all([questions.refetch(), completion.refetch()]);
              }}
            />
          ) : (
            <QuestionInsightPanel
              chapterCompletion={completion.data}
              questionHref={`/teacher/questions?classroomId=${classroomId}`}
              questions={questions.data}
              showCompletion={source !== 'live'}
            />
          )}
        </div>

        {liveHistory.isPending ? (
          <AnalyticsRegionState kind="loading" label="Live 課程" />
        ) : liveHistory.isError ? (
          <AnalyticsRegionState
            kind="error"
            label="Live 課程"
            onRetry={() => {
              void liveHistory.refetch();
            }}
          />
        ) : (
          <LiveHistoryPanel
            history={liveHistory.data}
            onPageChange={setLivePage}
            page={livePage}
          />
        )}
      </div>
    </TeacherWorkSurface>
  );
}

export function TeacherAnalyticsPage(props: TeacherAnalyticsPageProps) {
  return <TeacherAnalyticsPageContent {...props} />;
}
