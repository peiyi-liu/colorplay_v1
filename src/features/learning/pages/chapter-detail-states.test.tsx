import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  chapterMasteryRingValue,
  ContentPreparingState,
  ContentReadinessErrorState,
  ErrorState,
  LoadingState,
  LockedState,
  MasteryDisplayView,
} from './chapter-detail-states';

describe('LoadingState', () => {
  it('顯示 loading 狀態並具備 aria-live announcement', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('章節資料載入中');
  });
});

describe('LockedState', () => {
  it('用固定 code→copy 對照表顯示條件，不顯示 raw code', () => {
    render(
      <LockedState
        chapterTitle="色彩認知"
        unmetConditions={[
          {
            chapterId: 'c2',
            chapterTitle: '色彩表示',
            code: 'PREREQUISITE_MASTERY',
            current: 45,
            required: 80,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('heading', { name: /色彩認知/u }),
    ).toBeInTheDocument();
    expect(screen.getByText(/色彩表示/u)).toBeInTheDocument();
    expect(screen.getByText(/80/u)).toBeInTheDocument();
    expect(screen.queryByText('PREREQUISITE_MASTERY')).toBeNull();
  });

  it('unmetConditions 為空陣列時仍顯示可理解的頁面（過期快取重新確認中）', () => {
    render(<LockedState chapterTitle="色彩認知" unmetConditions={[]} />);
    expect(
      screen.getByRole('heading', { name: /色彩認知/u }),
    ).toBeInTheDocument();
  });

  it('accessible name 與 ContentPreparingState 不同', () => {
    render(<LockedState chapterTitle="色彩認知" unmetConditions={[]} />);
    expect(screen.getByRole('region')).toHaveAccessibleName(
      expect.stringContaining('鎖定'),
    );
  });
});

describe('ContentPreparingState', () => {
  it('accessible name 與 LockedState 不同', () => {
    render(<ContentPreparingState chapterTitle="色彩心理" />);
    const region = screen.getByRole('region');
    expect(region).toHaveAccessibleName(expect.stringContaining('準備中'));
    expect(region).not.toHaveAccessibleName(expect.stringContaining('鎖定'));
  });
});

describe('ContentReadinessErrorState', () => {
  it('顯示錯誤原因且不提供重試按鈕', () => {
    render(
      <ContentReadinessErrorState
        chapterTitle="色彩表示"
        reason="章節已發布但沒有可用的複習卡"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('沒有可用的複習卡');
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });
});

describe('ErrorState', () => {
  it('retryable=true 時顯示重試按鈕並觸發 onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState errorCode="UNAVAILABLE" onRetry={onRetry} retryable />);
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('errorCode=CHAPTER_NOT_FOUND 時顯示找不到章節文案與回學習地圖連結，不顯示重試按鈕', () => {
    render(
      <MemoryRouter>
        <ErrorState
          errorCode="CHAPTER_NOT_FOUND"
          onRetry={undefined}
          retryable={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('找不到這個章節');
    expect(screen.getByRole('link', { name: '回學習地圖' })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });

  it('retryable=false 且非 CHAPTER_NOT_FOUND 時不顯示重試按鈕', () => {
    render(
      <MemoryRouter>
        <ErrorState
          errorCode="INVALID_RESPONSE"
          onRetry={undefined}
          retryable={false}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });
});

describe('MasteryDisplayView', () => {
  it('kind=legacy-recorded 顯示「目前記錄精熟度」與規則版本，不出現最高／目前內容版本／已合併字樣', () => {
    render(
      <MasteryDisplayView
        display={{
          kind: 'legacy-recorded',
          masteryPercent: 59.5,
          rulesVersion: '2026-07-progress-1',
        }}
      />,
    );
    expect(screen.getByText(/目前記錄精熟度 59.5%/u)).toBeInTheDocument();
    expect(
      screen.getByText(/規則版本 2026-07-progress-1/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/跨版本比較尚待資料更新/u)).toBeInTheDocument();
    expect(screen.queryByText(/最高/u)).toBeNull();
    expect(screen.queryByText(/目前內容版本/u)).toBeNull();
    expect(screen.queryByText(/已合併/u)).toBeNull();
  });

  it('kind=not-attempted-current-version 顯示目前版本尚未測驗與版本識別碼', () => {
    render(
      <MasteryDisplayView
        display={{
          currentContentVersion: '2026-09-progress-2',
          kind: 'not-attempted-current-version',
        }}
      />,
    );
    expect(screen.getByText(/目前版本尚未測驗/u)).toBeInTheDocument();
    expect(screen.getByText(/2026-09-progress-2/u)).toBeInTheDocument();
  });

  it('kind=unavailable-until-backend-contract 顯示精熟度資料暫時無法確認，不顯示 0% 也不顯示「尚未測驗」', () => {
    render(
      <MasteryDisplayView
        display={{ kind: 'unavailable-until-backend-contract' }}
      />,
    );
    expect(screen.getByText('精熟度資料暫時無法確認')).toBeInTheDocument();
    expect(screen.queryByText(/%/u)).toBeNull();
    expect(screen.queryByText(/尚未測驗/u)).toBeNull();
  });

  it('kind=versioned 且 highest／current 版本與數值皆相同 → 只呈現一行合併數字', () => {
    const score = { contentVersion: 'v1', masteryPercent: 59.5 };
    render(
      <MasteryDisplayView
        display={{
          current: score,
          highest: score,
          kind: 'versioned',
          merged: true,
        }}
      />,
    );
    expect(screen.getAllByText(/59.5%/u)).toHaveLength(1);
  });

  it('kind=versioned 且版本不同 → 分別顯示跨版本最高與目前版本最新', () => {
    render(
      <MasteryDisplayView
        display={{
          current: { contentVersion: 'v2', masteryPercent: 40 },
          highest: { contentVersion: 'v1', masteryPercent: 82 },
          kind: 'versioned',
          merged: false,
        }}
      />,
    );
    expect(screen.getByText(/82%/u)).toBeInTheDocument();
    expect(screen.getByText(/40%/u)).toBeInTheDocument();
  });

  it('kind=versioned 且 current 為未測驗 → 顯示目前版本尚未測驗，不顯示 0%', () => {
    render(
      <MasteryDisplayView
        display={{
          current: { contentVersion: 'v2', kind: 'not-attempted' },
          highest: { contentVersion: 'v1', masteryPercent: 82 },
          kind: 'versioned',
          merged: false,
        }}
      />,
    );
    expect(screen.getByText('目前版本尚未測驗')).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
  });
});

describe('chapterMasteryRingValue', () => {
  it('legacy-recorded 回傳實際記錄數值（環形進度可以顯示已知的單一數字）', () => {
    expect(
      chapterMasteryRingValue({
        kind: 'legacy-recorded',
        masteryPercent: 59.5,
        rulesVersion: '2026-07-progress-1',
      }),
    ).toBe(59.5);
  });

  it('not-attempted-current-version／unavailable-until-backend-contract 回傳 null（不假裝有資料）', () => {
    expect(
      chapterMasteryRingValue({
        currentContentVersion: '2026-09-progress-2',
        kind: 'not-attempted-current-version',
      }),
    ).toBeNull();
    expect(
      chapterMasteryRingValue({ kind: 'unavailable-until-backend-contract' }),
    ).toBeNull();
  });

  it('versioned 回傳 highest 數值', () => {
    const score = { contentVersion: 'v1', masteryPercent: 82 };
    expect(
      chapterMasteryRingValue({
        current: score,
        highest: score,
        kind: 'versioned',
        merged: true,
      }),
    ).toBe(82);
  });
});
