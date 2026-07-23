// 名次 → PR 百分位（rank 1 = PR 100）。分母為班級總人數。
export function toPercentile(rank: number, total: number): number {
  if (total <= 0 || rank <= 0 || rank > total) return 0;
  return Math.round((1 - (rank - 1) / total) * 100);
}
