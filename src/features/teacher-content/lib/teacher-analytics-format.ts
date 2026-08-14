export const EM_DASH = '—';

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? EM_DASH : `${value.toFixed(1)}%`;
