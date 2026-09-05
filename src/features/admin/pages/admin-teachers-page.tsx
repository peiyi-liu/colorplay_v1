import { safeTraceId } from '../api/admin-outcome';
import { teacherOperationOutcome } from '../api/teacher-operation-outcome';
import { TeacherOperationStatus } from '../components/teacher-operation-status';
import { useAdminOperations } from '../components/admin-operation-notices';
import { commandOutcome } from '../api/admin-outcome';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AdminPageLoading } from '../components/admin-page-loading';
import { AdminQueryStatus } from '../components/admin-query-status';
import type { AdminErrorCode } from '../api/admin-client';
import type {
  CreateTeacherAccountInput,
  TeacherOperationStatusResult,
  TeacherOperationState,
  TeacherListOutcome,
} from '../api/teacher-account-contract';
import { createTeacherAccountRepository } from '../api/teacher-account-repository';
import { AdminDataTable } from '../components/admin-data-table';
import { AdminStatusBanner } from '../components/admin-status-banner';
import {
  TeacherAccountForm,
  type TeacherAccountFormValues,
} from '../components/teacher-account-form';
import { TeacherSecretReceipt } from '../components/teacher-secret-receipt';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';
import { formatAdminTimestamp } from '../lib/admin-time';

const repository = createTeacherAccountRepository();
const TEACHERS_QUERY_KEY = ['admin', 'teachers'] as const;

interface Filters {
  search: string | null;
  state: TeacherOperationState | null;
}

interface SecretState {
  loginAccount: string;
  password: string;
  teacherId: string;
}

const stateLabel: Record<TeacherOperationState, string> = {
  operation_pending: '作業處理中',
  ready: '可操作',
  reconciliation_required: '需要對帳',
};

export function AdminTeachersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const operations = useAdminOperations();
  const inFlight = useRef(false);
  const checkingRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftState, setDraftState] = useState<TeacherOperationState | ''>('');
  const [filters, setFilters] = useState<Filters>({
    search: null,
    state: null,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commandInput, setCommandInput] =
    useState<CreateTeacherAccountInput | null>(null);
  const [operationStatus, setOperationStatus] =
    useState<TeacherOperationStatusResult | null>(null);
  const [commandDenied, setCommandDenied] = useState<AdminErrorCode | null>(
    null,
  );
  const [unexpectedError, setUnexpectedError] = useState(false);
  const [replayNotice, setReplayNotice] = useState(false);
  const [secret, setSecret] = useState<SecretState | null>(null);

  const unresolved =
    commandInput !== null &&
    (submitting ||
      checking ||
      unexpectedError ||
      (operationStatus !== null && operationStatus.legalFollowUp !== 'none'));

  const list = useInfiniteQuery({
    getNextPageParam: (lastPage: TeacherListOutcome) =>
      lastPage.outcome === 'ok' ? lastPage.nextCursor : null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }): Promise<TeacherListOutcome> =>
      repository.listTeachers({
        cursor: pageParam,
        search: filters.search,
        state: filters.state,
      }),
    queryKey: [...TEACHERS_QUERY_KEY, filters.search, filters.state],
  });
  const firstPage = list.data?.pages[0];
  const laterDenied = list.data?.pages
    .slice(1)
    .find((page) => page.outcome === 'denied');
  const listDenied = firstPage?.outcome === 'denied' ? firstPage : laterDenied;
  const staleSession =
    listDenied?.code === 'STALE_PRIVILEGED_SESSION' ||
    commandDenied === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  const checkOperation = async (input: CreateTeacherAccountInput) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setFormOpen(false);
    setCommandDenied(null);
    setUnexpectedError(false);
    setOperationStatus(null);
    try {
      const status = await repository.getOperation({
        command: 'create_teacher_account',
        requestId: input.requestId,
      });
      if (status.outcome === 'denied') {
        setUnexpectedError(true);
        setCommandDenied(status.code);
        return;
      }
      setOperationStatus(status);
      operations?.settle(input.requestId, teacherOperationOutcome(status));
      if (status.legalFollowUp === 'none')
        void queryClient.invalidateQueries({ queryKey: ['admin', 'teachers'] });
    } catch {
      setUnexpectedError(true);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  const runCreate = async (input: CreateTeacherAccountInput) => {
    if (inFlight.current) return;
    inFlight.current = true;
    operations?.begin(
      'create_teacher_account',
      input.requestId,
      '教師帳號操作',
    );
    setSubmitting(true);
    setCommandDenied(null);
    setUnexpectedError(false);
    setOperationStatus(null);
    try {
      const result = await repository.createTeacher(input);
      operations?.settle(
        input.requestId,
        result.outcome === 'denied'
          ? {
              ...commandOutcome('create_teacher_account', null),
              kind: 'denied',
              message: '教師作業尚未完成，請查看本頁狀態。',
              requestId: result.requestId,
              operationId: result.operationId,
            }
          : {
              ...commandOutcome('create_teacher_account', {
                outcome: 'ok',
                result: result.result,
              }),
              requestId: result.requestId,
              operationId: result.operationId,
            },
      );
      if (result.outcome === 'denied') {
        if (result.statusCheckRequired) await checkOperation(input);
        else setCommandDenied(result.code);
        return;
      }
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: TEACHERS_QUERY_KEY });
      if (result.secretReplayable) {
        setSecret({
          loginAccount: result.loginAccount,
          password: result.password,
          teacherId: result.teacherId,
        });
      } else {
        setReplayNotice(true);
        setCommandInput(null);
      }
    } catch {
      await checkOperation(input);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (list.isPending || staleSession)
    return <AdminPageLoading title="教師帳號" onRetry={() => list.refetch()} />;

  if (!list.data || !firstPage || firstPage.outcome === 'denied') {
    return (
      <section aria-labelledby="admin-teachers-heading" className="page-wide">
        <div>
          <h1 id="admin-teachers-heading">教師帳號</h1>
          <p>查詢教師資料，確認目前狀態與可進行的操作。</p>
        </div>
        {firstPage?.outcome === 'denied' ? (
          <>
            <AdminStatusBanner code={firstPage.code} />
            <p>追蹤代碼：{safeTraceId(firstPage.requestId)}</p>
          </>
        ) : (
          <p role="alert">教師清單載入失敗，請稍後重試。</p>
        )}
        {firstPage?.outcome !== 'denied' || firstPage.retryable ? (
          <button
            className="secondary-action"
            onClick={() => void list.refetch()}
            type="button"
          >
            重試
          </button>
        ) : null}
      </section>
    );
  }

  const rows = list.data.pages.flatMap((page) =>
    page.outcome === 'ok' ? page.rows : [],
  );
  const lastPage = list.data.pages.at(-1);
  const tableRows = rows.map((teacher) => ({
    contactEmail: teacher.contactEmailMasked,
    createdAt: formatAdminTimestamp(teacher.createdAt),
    displayName: teacher.displayName,
    loginAccount: teacher.loginAccount,
    state: stateLabel[teacher.operationState],
  }));

  return (
    <section
      aria-labelledby="admin-teachers-heading"
      className="page-wide page-stack admin-teachers"
    >
      <div className="admin-teachers__heading-row">
        <h1 id="admin-teachers-heading">教師帳號</h1>
        <AdminQueryStatus query={list} />
        {!formOpen &&
        !secret &&
        !unresolved &&
        !submitting &&
        !checking &&
        !operations?.blocked('create_teacher_account') ? (
          <button
            className="primary-action"
            data-primary-action="true"
            onClick={() => {
              setFormOpen(true);
              setCommandDenied(null);
              setUnexpectedError(false);
              setOperationStatus(null);
              setReplayNotice(false);
            }}
            type="button"
          >
            新增教師
          </button>
        ) : null}
      </div>

      <form
        aria-label="教師清單篩選"
        className="admin-teachers__filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({
            search: draftSearch.trim() || null,
            state: draftState || null,
          });
        }}
      >
        <div>
          <label htmlFor="admin-teacher-search">搜尋教師</label>
          <input
            id="admin-teacher-search"
            placeholder="教師姓名或登入帳號"
            onChange={(event) => {
              setDraftSearch(event.target.value);
            }}
            value={draftSearch}
          />
        </div>
        <div>
          <label htmlFor="admin-teacher-state">作業狀態</label>
          <select
            id="admin-teacher-state"
            onChange={(event) => {
              setDraftState(event.target.value as TeacherOperationState | '');
            }}
            value={draftState}
          >
            <option value="">全部</option>
            <option value="ready">可操作</option>
            <option value="operation_pending">作業處理中</option>
            <option value="reconciliation_required">需要對帳</option>
          </select>
        </div>
        <button className="secondary-action" type="submit">
          套用篩選
        </button>
      </form>

      <div className="admin-panel-heading">
        <h2>教師清單</h2>
        <span>已載入 {rows.length} 筆 · 聯絡資料保持遮罩</span>
      </div>
      {rows.length === 0 ? (
        <div className="admin-empty-state">
          <p>
            {filters.search || filters.state
              ? '目前沒有符合條件的教師帳號。'
              : '尚未建立教師帳號。'}
          </p>
          {filters.search || filters.state ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setDraftSearch('');
                setDraftState('');
                setFilters({ search: null, state: null });
              }}
            >
              清除篩選
            </button>
          ) : null}
        </div>
      ) : (
        <AdminDataTable
          caption="教師帳號清單"
          columns={[
            { header: '教師姓名', key: 'displayName', personal: false },
            { header: '登入帳號', key: 'loginAccount', personal: false },
            { header: '狀態', key: 'state', personal: false },
            { header: '聯絡 Email', key: 'contactEmail', personal: false },
            { header: '建立時間', key: 'createdAt', personal: false },
          ]}
          isLoadingMore={list.isFetchingNextPage}
          nextCursor={
            list.hasNextPage && lastPage?.outcome === 'ok'
              ? lastPage.nextCursor
              : null
          }
          onLoadMore={() => void list.fetchNextPage()}
          rowActions={(index) => {
            const teacher = rows[index];
            return teacher ? (
              <Link
                className="admin-teachers__detail-link"
                to={`/admin/teachers/${teacher.teacherId}`}
              >
                {teacher.operationState === 'ready' ? '查看教師' : '查看作業'}
              </Link>
            ) : null;
          }}
          rows={tableRows}
        />
      )}

      {laterDenied ? (
        <div className="admin-data-browser__page-error">
          <AdminStatusBanner code={laterDenied.code} />
          <p>追蹤代碼：{safeTraceId(laterDenied.requestId)}</p>
          {laterDenied.retryable ? (
            <button
              className="secondary-action"
              onClick={() => void list.refetch()}
              type="button"
            >
              重試載入更多
            </button>
          ) : null}
        </div>
      ) : null}

      {checking || submitting ? (
        <p role="status">
          {checking ? '正在查詢作業狀態…' : '教師作業處理中，請勿重複送出。'}
        </p>
      ) : null}
      {unexpectedError && !checking ? (
        <button
          type="button"
          className="secondary-action"
          onClick={() => {
            if (commandInput) void checkOperation(commandInput);
          }}
        >
          重新查詢狀態
        </button>
      ) : null}
      {operationStatus ? (
        <TeacherOperationStatus
          status={operationStatus}
          busy={checking || submitting}
          onRetry={() => {
            if (commandInput) void runCreate(commandInput);
          }}
          onCheck={() => {
            if (commandInput) void checkOperation(commandInput);
          }}
        />
      ) : null}
      {commandDenied && !formOpen ? (
        <AdminStatusBanner code={commandDenied} />
      ) : null}
      {unexpectedError && !formOpen ? (
        <p role="alert">狀態查詢失敗；系統沒有重送教師帳號操作。</p>
      ) : null}
      {replayNotice ? (
        <p role="status">操作先前已完成；一次性密碼不會再次顯示。</p>
      ) : null}

      {formOpen ? (
        <TeacherAccountForm
          deniedCode={commandDenied}
          isSubmitting={submitting}
          mode="create"
          onCancel={() => {
            setFormOpen(false);
          }}
          onSubmit={(values) => {
            const input = {
              ...(values as TeacherAccountFormValues),
              requestId: crypto.randomUUID(),
            };
            setCommandInput(input);
            void runCreate(input);
          }}
          unexpectedError={unexpectedError}
        />
      ) : null}

      {secret ? (
        <TeacherSecretReceipt
          loginAccount={secret.loginAccount}
          onClose={() => {
            const teacherId = secret.teacherId;
            setSecret(null);
            setCommandInput(null);
            void navigate(`/admin/teachers/${teacherId}`, { replace: true });
          }}
          password={secret.password}
        />
      ) : null}
    </section>
  );
}

export { AdminTeachersPage as Component };
