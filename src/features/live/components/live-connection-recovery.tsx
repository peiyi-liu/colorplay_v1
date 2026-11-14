import type { LiveSessionQueryResult } from '../hooks/use-live-session';
import './live-connection-recovery.css';

type RecoveryProps = Pick<
  LiveSessionQueryResult,
  'connectionStatus' | 'reconnecting' | 'reconnect'
> & { host?: boolean };

export function LiveConnectionRecovery({
  connectionStatus,
  reconnecting,
  reconnect,
  host = false,
}: RecoveryProps) {
  if (!host && connectionStatus !== 'disconnected') return null;
  const copy =
    connectionStatus === 'connected'
      ? '主持連線正常'
      : connectionStatus === 'connecting'
        ? '主持連線中…'
        : reconnecting
          ? '正在重新連線…'
          : '連線中斷';
  return (
    <div
      aria-label={host ? '主持人連線狀態' : '連線恢復'}
      className="live-connection-recovery"
      role="group"
    >
      <p data-state={connectionStatus} role="status">
        {copy}
      </p>
      {connectionStatus === 'disconnected' ? (
        <button
          className="secondary-action"
          disabled={reconnecting}
          onClick={reconnect}
          type="button"
        >
          重新連線
        </button>
      ) : null}
    </div>
  );
}
