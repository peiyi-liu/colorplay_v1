// 主持動作的文案模組：label 與 emphasis（動作本身樣式）依 audience 查表。
// emphasis 與 phase view 的 precedence（階段內主次）是兩個概念，不得混用。

import type { LiveTransitionName } from '../hooks/use-live-commands';

export type ActionAudience = 'hostConsole' | 'projector';

export type ActionCopy = Readonly<{
  label: string;
  emphasis: 'primary' | 'secondary';
}>;

const BASE_COPY: Record<LiveTransitionName, ActionCopy> = {
  advance: { emphasis: 'primary', label: '下一題' },
  cancel: { emphasis: 'secondary', label: '取消挑戰' },
  closeQuestion: { emphasis: 'primary', label: '收題並公布答案' },
  finalize: { emphasis: 'primary', label: '結算成績' },
  openQuestion: { emphasis: 'primary', label: '開始第一題' },
  pauseSession: { emphasis: 'secondary', label: '暫停' },
  resumeSession: { emphasis: 'primary', label: '繼續作答' },
  startSession: { emphasis: 'primary', label: '開啟等待室' },
};

// 兩個 audience 目前文案一致；日後投影端分化時只改這張表。
const COPY: Record<ActionAudience, Record<LiveTransitionName, ActionCopy>> = {
  hostConsole: BASE_COPY,
  projector: BASE_COPY,
};

export const actionCopy = (
  transition: LiveTransitionName,
  audience: ActionAudience,
): ActionCopy => COPY[audience][transition];

// 原樣搬移自 teacher-live-session-page（transition 失敗的使用者文案）。
export const transitionErrorCopy = (code: string): string =>
  code === 'STATE_CONFLICT'
    ? '另一個主持分頁已推進狀態，畫面已同步為最新。'
    : code === 'INVALID_TRANSITION'
      ? '目前狀態不允許這個操作。'
      : '操作暫時無法完成，請稍後重試。';
