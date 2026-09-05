import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AdminCommandName } from '../api/admin-client';
import type { SafeCommandOutcome } from '../api/admin-outcome';
import { AdminTrace } from './admin-trace';

interface Notice extends SafeCommandOutcome {
  id: string;
  title: string;
  command: AdminCommandName;
}
interface Operations {
  begin: (command: AdminCommandName, id: string, title: string) => void;
  settle: (id: string, result: SafeCommandOutcome) => void;
  blocked: (command: AdminCommandName) => boolean;
}
const Context = createContext<Operations | null>(null);
export const useAdminOperations = () => useContext(Context);
/** Only safe display summaries live here; no args, receipts, response bodies or secrets. */
export function AdminOperationProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [notices, setNotices] = useState<Notice[]>([]);
  const value: Operations = {
    begin: (command, id, title) => {
      setNotices((rows) => [
        ...rows.filter((row) => row.id !== id),
        {
          command,
          id,
          title,
          kind: 'unknown',
          message: '請求處理中，尚未收到結果。',
          code: null,
          requestId: null,
          operationId: null,
          retryable: false,
        },
      ]);
    },
    settle: (id, result) => {
      if (result.kind === 'completed' || result.kind === 'accepted')
        void queryClient.invalidateQueries({ queryKey: ['admin'] });
      setNotices((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...result } : row)),
      );
    },
    blocked: (command) =>
      notices.some((row) => row.command === command && row.kind === 'unknown'),
  };
  return (
    <Context.Provider value={value}>
      {notices.length > 0 ? (
        <section className="admin-operation-notices" aria-label="本次操作結果">
          {notices.map((notice) => (
            <div
              className={`admin-operation-notice admin-operation-notice--${notice.kind}`}
              key={notice.id}
            >
              <strong>{notice.title}</strong>
              <p role="status">{notice.message}</p>
              <AdminTrace label="本次操作識別碼" value={notice.id} />
              <AdminTrace value={notice.requestId} />
              <AdminTrace label="作業代碼" value={notice.operationId} />
              {notice.kind === 'accepted' || notice.kind === 'unknown' ? (
                <p>
                  <Link to="/admin/health">查看系統健康</Link>
                  ；查無作業或結果不明時，請將識別碼交給負責人查核，勿重新發起相同操作。
                </p>
              ) : null}
              {notice.kind !== 'unknown' ? (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setNotices((rows) =>
                      rows.filter((row) => row.id !== notice.id),
                    );
                  }}
                >
                  關閉結果
                </button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {children}
    </Context.Provider>
  );
}
