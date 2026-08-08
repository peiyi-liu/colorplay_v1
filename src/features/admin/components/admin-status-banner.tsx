import { ADMIN_ERROR_MESSAGES, type AdminErrorCode } from '../api/admin-client';

interface AdminStatusBannerProps {
  code: AdminErrorCode | null;
}

/**
 * spec §3.4:命令結果/timeout/denial/incident 統一以 aria-live 播報。live
 * region 節點恆存在(即使目前無訊息),讓 screen reader 能偵測到後續變化;
 * 訊息文案是純轉譯,授權判斷仍在 PG/Edge(AGENTS.md §5)。
 */
export function AdminStatusBanner({ code }: AdminStatusBannerProps) {
  return (
    <p aria-live="polite" className="admin-status-banner" role="status">
      {code ? ADMIN_ERROR_MESSAGES[code] : null}
    </p>
  );
}
