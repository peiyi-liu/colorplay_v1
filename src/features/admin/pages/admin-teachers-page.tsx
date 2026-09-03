import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
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
        setCommandDenied(status.code);
        return;
      }
      setOperationStatus(status);
    } catch {
      setUnexpectedError(true);
    }
  };

  const runCreate = async (input: CreateTeacherAccountInput) => {
    setSubmitting(true);
    setCommandDenied(null);
    setUnexpectedError(false);
    setOperationStatus(null);
    try {
      const result = await repository.createTeacher(input);
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
      setSubmitting(false);
    }
  };

  if (list.isPending || staleSession) return <RouteLoading withinMain />;

  if (list.isError || !firstPage || firstPage.outcome === 'denied') {
    return (
      <section aria-labelledby="admin-teachers-heading" className="page-wide">
        <h1 id="admin-teachers-heading">教師帳號</h1>
        {firstPage?.outcome === 'denied' ? (
          <>
            <AdminStatusBanner code={firstPage.code} />
            <p>追蹤代碼：{firstPage.requestId}</p>
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
        {!formOpen && !secret ? (
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

      {rows.length === 0 ? (
        <p>目前沒有符合條件的教師帳號。</p>
      ) : (
        <AdminDataTable
          caption="教師帳號清單"
          columns={[
            { header: '登入帳號', key: 'loginAccount', personal: false },
            { header: '教師姓名', key: 'displayName', personal: false },
            { header: '聯絡 Email', key: 'contactEmail', personal: false },
            { header: '狀態', key: 'state', personal: false },
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
                查看教師
              </Link>
            ) : null;
          }}
          rows={tableRows}
        />
      )}

      {laterDenied ? (
        <div className="admin-data-browser__page-error">
          <AdminStatusBanner code={laterDenied.code} />
          <p>追蹤代碼：{laterDenied.requestId}</p>
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

      {operationStatus ? (
        <div aria-live="polite" className="admin-teachers__operation-status">
          {operationStatus.operationId ? (
            <p>作業代碼：{operationStatus.operationId}</p>
          ) : null}
          {operationStatus.legalFollowUp === 'retry_same_request' ? (
            <>
              <p>伺服器尚未受理這次操作，可使用原操作代碼重試。</p>
              <button
                className="secondary-action"
                onClick={() => commandInput && void runCreate(commandInput)}
                type="button"
              >
                以相同代碼重試
              </button>
            </>
          ) : null}
          {operationStatus.legalFollowUp === 'wait' ? (
            <>
              <p>作業仍在處理中。</p>
              <button
                className="secondary-action"
                onClick={() =>
                  commandInput && void checkOperation(commandInput)
                }
                type="button"
              >
                重新查詢狀態
              </button>
            </>
          ) : null}
          {operationStatus.legalFollowUp === 'health_reconciliation' ? (
            <p>
              作業需要受控對帳。
              <Link className="admin-teachers__health-link" to="/admin/health">
                前往健康狀態
              </Link>
            </p>
          ) : null}
          {operationStatus.legalFollowUp === 'none' ? (
            <p>操作已完成或終止，不會再次重送。</p>
          ) : null}
        </div>
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
            if (!submitting) setFormOpen(false);
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
