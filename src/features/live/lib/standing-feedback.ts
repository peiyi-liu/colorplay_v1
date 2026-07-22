import type { LiveMyStanding } from '../types';

/** 色塊＋形狀雙編碼的中文名稱，順序對齊作答鈕的 variant/shape 順序。 */
export const OPTION_COLOR_NAMES = ['紅色', '藍色', '黃色', '綠色'] as const;
export const OPTION_SHAPE_NAMES = [
  '三角形',
  '正方形',
  '圓形',
  '菱形',
] as const;

export const optionAccessibleName = (index: number, key: string): string => {
  const color = OPTION_COLOR_NAMES[index % 4] ?? '';
  const shape = OPTION_SHAPE_NAMES[index % 4] ?? '';
  return `選項 ${key}：${color}${shape}`;
};

/** 題間個人回饋的鼓勵語（owner 裁定文案方向：名次、分差、鼓勵）。 */
export const encouragementFor = (standing: LiveMyStanding): string => {
  if (standing.rank === 1) {
    return '你是目前的全場第一，守住寶座！';
  }
  if (standing.aheadRank === null || standing.pointsBehind === null) {
    return '穩住節奏，下一題繼續衝！';
  }
  if (standing.pointsBehind === 0) {
    return `和第 ${String(standing.aheadRank)} 名同分，下一題就能反超！`;
  }
  return `差 ${String(standing.pointsBehind)} 分就能超越第 ${String(
    standing.aheadRank,
  )} 名，加油！`;
};
