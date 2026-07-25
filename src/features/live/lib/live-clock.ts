// Live 場次的時間投影：所有「還剩幾秒、環畫多滿、要不要滴答」的規則
// 集中於此。Postgres 仍是狀態機唯一 authority（ADR 0004）；本模組只讀
// session payload，不決定任何狀態轉換。

export const remainingSeconds = (
  deadlineAt: string | null,
  serverTime: string,
  now: number,
  fetchedAt: number,
): number | null => {
  if (!deadlineAt) return null;
  const serverOffset = new Date(serverTime).getTime() - fetchedAt;
  const serverNow = now + serverOffset;
  return Math.max(
    0,
    Math.ceil((new Date(deadlineAt).getTime() - serverNow) / 1000),
  );
};

type LiveClockStateInput = Readonly<{
  state: string;
  serverTime: string;
  pausedRemainingMs?: number | null;
  question?: Readonly<{
    deadlineAt: string | null;
    openedAt: string | null;
  }> | null;
}>;

export type LiveClockTick = Readonly<{
  secondsLeft: number | null;
  fraction: number;
  isFinalCountdown: boolean;
}>;

// paused 的秒數凍結自伺服器計算的 pausedRemainingMs，與 client 時鐘無關，
// 因此 now / fetchedAt 在該分支未使用。
export const tick = (
  state: LiveClockStateInput,
  now: number,
  fetchedAt: number,
): LiveClockTick => {
  if (state.state === 'paused') {
    return {
      fraction: 0,
      isFinalCountdown: false,
      secondsLeft: Math.ceil((state.pausedRemainingMs ?? 0) / 1000),
    };
  }

  const deadlineAt = state.question?.deadlineAt ?? null;
  const openedAt = state.question?.openedAt ?? null;
  const secondsLeft = remainingSeconds(
    deadlineAt,
    state.serverTime,
    now,
    fetchedAt,
  );
  const totalMs =
    deadlineAt && openedAt
      ? Math.max(1, Date.parse(deadlineAt) - Date.parse(openedAt))
      : null;
  const fraction =
    secondsLeft !== null && totalMs
      ? Math.min(1, Math.max(0, (secondsLeft * 1000) / totalMs))
      : 0;

  return {
    fraction,
    isFinalCountdown:
      secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5,
    secondsLeft,
  };
};
