import { useState } from 'react';
import { safeTraceId } from '../api/admin-outcome';

export function AdminTrace({
  value,
  label = '追蹤代碼',
}: Readonly<{ value: unknown; label?: string }>) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = safeTraceId(value);
  if (!id) return null;
  const copied = copiedId === id;
  const copy = async () => {
    setCopiedId(null);
    setFailed(false);
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="admin-trace">
      <span>
        {label}：<code>{id}</code>
      </span>
      <button
        type="button"
        className="secondary-action"
        aria-label={`複製${label}`}
        onClick={() => void copy()}
      >
        {copied ? '已複製' : '複製'}
      </button>
      <span role="status">
        {failed ? '複製失敗，請選取代碼複製。' : copied ? '代碼已複製。' : ''}
      </span>
    </div>
  );
}
