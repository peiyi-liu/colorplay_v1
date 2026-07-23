import { useState } from 'react';
import { useNavigate, useRouteError } from 'react-router-dom';

type RootErrorBoundaryProps = Readonly<{
  error: unknown;
  reset: () => void;
}>;

export function RootErrorBoundary({ reset }: RootErrorBoundaryProps) {
  const [correlationId] = useState(() => crypto.randomUUID());

  return (
    <main role="alert">
      <h1>頁面暫時無法顯示</h1>
      <p>請再試一次。若問題持續發生，請記下下方代碼並聯絡支援。</p>
      <p>追蹤代碼：{correlationId}</p>
      <button type="button" onClick={reset}>
        重試
      </button>
    </main>
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return <RootErrorBoundary error={error} reset={() => void navigate(0)} />;
}
