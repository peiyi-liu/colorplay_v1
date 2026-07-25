import { describe, expect, it } from 'vitest';

import { actionCopy, transitionErrorCopy } from './live-action-copy';

describe('actionCopy', () => {
  // ← 轉譯自 hostAction 的 label 對照（原 teacher-live-session-page.tsx:26-43）
  it('labels every transition for the host console', () => {
    expect(actionCopy('startSession', 'hostConsole')).toEqual({
      emphasis: 'primary',
      label: '開啟等待室',
    });
    expect(actionCopy('openQuestion', 'hostConsole')).toEqual({
      emphasis: 'primary',
      label: '開始第一題',
    });
    expect(actionCopy('closeQuestion', 'hostConsole')).toEqual({
      emphasis: 'primary',
      label: '收題並公布答案',
    });
    expect(actionCopy('resumeSession', 'hostConsole')).toEqual({
      emphasis: 'primary',
      label: '繼續作答',
    });
    expect(actionCopy('advance', 'hostConsole')).toEqual({
      emphasis: 'primary',
      label: '下一題',
    });
    expect(actionCopy('finalize', 'hostConsole')).toEqual({
      emphasis: 'primary',
      label: '結算成績',
    });
    expect(actionCopy('pauseSession', 'hostConsole')).toEqual({
      emphasis: 'secondary',
      label: '暫停',
    });
    expect(actionCopy('cancel', 'hostConsole')).toEqual({
      emphasis: 'secondary',
      label: '取消挑戰',
    });
  });

  it('keeps projector copy aligned with the host console today', () => {
    expect(actionCopy('closeQuestion', 'projector')).toEqual(
      actionCopy('closeQuestion', 'hostConsole'),
    );
    expect(actionCopy('pauseSession', 'projector')).toEqual(
      actionCopy('pauseSession', 'hostConsole'),
    );
  });
});

describe('transitionErrorCopy', () => {
  // ← 原樣搬移自 teacher-live-session-page.tsx:18-23（H2 斷言的文案來源）
  it('maps each transition error code to its stable copy', () => {
    expect(transitionErrorCopy('STATE_CONFLICT')).toBe(
      '另一個主持分頁已推進狀態，畫面已同步為最新。',
    );
    expect(transitionErrorCopy('INVALID_TRANSITION')).toBe(
      '目前狀態不允許這個操作。',
    );
    expect(transitionErrorCopy('UNAVAILABLE')).toBe(
      '操作暫時無法完成，請稍後重試。',
    );
  });
});
