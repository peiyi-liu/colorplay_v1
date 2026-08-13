import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LiveJoinPage } from './live-join-page';
import {
  baseState,
  openState,
  renderWith,
  repositoryWith,
  SESSION_ID,
  stubClient,
} from './live-pages.test-fixtures';
import { LiveSessionPage } from './live-session-page';

describe('LiveJoinPage', () => {
  it('joins with one request id and enters the session route', async () => {
    const join = vi.fn().mockResolvedValue({
      sessionId: SESSION_ID,
      state: 'lobby',
      stateVersion: 2,
    });
    const repository = repositoryWith({ join });
    renderWith(<LiveJoinPage repository={repository} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('課堂代碼'), '123456');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(await screen.findByText('已進入課堂頁')).toBeVisible();
    expect(join).toHaveBeenCalledTimes(1);
    const joinArgs = join.mock.calls[0]?.[0] as {
      joinCode: string;
      requestId: string;
    };
    expect(joinArgs.joinCode).toBe('123456');
    expect(joinArgs.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('shows a safe error for an invalid code', async () => {
    renderWith(<LiveJoinPage repository={repositoryWith({})} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('課堂代碼'), 'nope12');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(await screen.findByText('請輸入六位數字課堂代碼')).toBeVisible();
  });

  it('renders the summons scroll: night scene and six rune slots lighting per typed digit', async () => {
    renderWith(<LiveJoinPage repository={repositoryWith({})} />);
    const user = userEvent.setup();

    expect(document.querySelector('.live-join.scene-night')).not.toBeNull();
    const slotsWrap = document.querySelector('.rune-slots');
    expect(slotsWrap).not.toBeNull();
    expect(slotsWrap).toHaveAttribute('aria-hidden', 'true');
    expect(slotsWrap).toHaveTextContent('');
    expect(document.querySelectorAll('.rune-slot')).toHaveLength(6);
    expect(document.querySelectorAll('.rune-slot--lit')).toHaveLength(0);

    await user.type(screen.getByLabelText('課堂代碼'), '123');

    expect(document.querySelectorAll('.rune-slot--lit')).toHaveLength(3);
  });
});

describe('LiveSessionPage (participant)', () => {
  it('submits one answer and locks the options', async () => {
    const submitAnswer = vi.fn().mockResolvedValue({ streak: 1 });
    const getState = vi
      .fn()
      .mockResolvedValueOnce(openState)
      .mockResolvedValue({
        ...openState,
        myAnswer: { answered: true },
      });
    const repository = repositoryWith({ getState, submitAnswer });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'A. 色相、明度、彩度' }),
    );

    await waitFor(() => {
      expect(submitAnswer).toHaveBeenCalledTimes(1);
    });
    const submitArgs = submitAnswer.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      selectedOptionId: string;
      sessionQuestionId: string;
    };
    expect(submitArgs.selectedOptionId).toBe(
      '18700000-0000-0000-0000-000000000001',
    );
    expect(submitArgs.sessionQuestionId).toBe(
      '18500000-0000-0000-0000-000000000001',
    );
    expect(submitArgs.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(
      await screen.findByText('已收到你的答案，等待其他同學…'),
    ).toBeVisible();
  });

  const screenOnlyQuestion = {
    questionId: '18500000-0000-0000-0000-000000000001',
    position: 1,
    publicOptions: [
      { id: '18700000-0000-0000-0000-000000000001', key: 'A', sortOrder: 1 },
      { id: '18700000-0000-0000-0000-000000000002', key: 'B', sortOrder: 2 },
      { id: '18700000-0000-0000-0000-000000000003', key: 'C', sortOrder: 3 },
      { id: '18700000-0000-0000-0000-000000000004', key: 'D', sortOrder: 4 },
    ],
    openedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 15000).toISOString(),
  };

  it('keeps the screen_only option label off-screen behind the shared visually-hidden class (DC 1192-1195: shape-only)', async () => {
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        state: 'question_open',
        stateVersion: 3,
        currentPosition: 1,
        questionDisplay: 'screen_only',
        question: screenOnlyQuestion,
        answeredCount: 0,
        myAnswer: { answered: false },
      }),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    const firstOption = await screen.findByRole('button', {
      name: '選項 A：紅色三角形',
    });
    // 純形狀鍵（DC 1192-1195）：色與形狀敘述只給螢幕閱讀器，畫面上只能看到
    // 形狀符號。這個描述必須套用共用的 .visually-hidden（globals.css:1216）
    // 而不是專案裡不存在任何 CSS 規則的 `sr-only`——後者在真實瀏覽器會直接
    // 顯示成看得到的文字，等於在雙螢幕模式洩題。
    expect(firstOption.querySelector('.visually-hidden')).not.toBeNull();
    expect(firstOption.querySelector('.sr-only')).toBeNull();
  });

  // device 模式（非雙螢幕）目前教師端 UI 已無法產生——10D 簡化後
  // teacher-live-page.tsx 移除了顯示位置選單，一鍵開場一律走後端預設的
  // screen_only（supabase/migrations/20260724000500_live_section_activities.sql:17）。
  // FeedbackPhase（DC 1207-1246 的分布條／教師引導解析／名次卡版本）因此無法
  // 被設計稽核截圖 runner（scripts/design-audit）以真實流程觸達，只能像這裡
  // 一樣直接注入 state 覆蓋。
  it('renders the non-fullscreen feedback phase in device mode (DC 1207-1246: distribution bars, amber explanation, standing card)', async () => {
    const feedbackQuestion = {
      questionId: '18500000-0000-0000-0000-000000000001',
      position: 1,
      prompt: '最早提出色彩排列系統化理論的學者是:',
      publicOptions: [
        {
          id: '18700000-0000-0000-0000-000000000001',
          key: 'A',
          text: '佛西士（Forsius）',
          sortOrder: 1,
        },
        {
          id: '18700000-0000-0000-0000-000000000002',
          key: 'B',
          text: '曼賽爾（Munsell）',
          sortOrder: 2,
        },
      ],
      openedAt: new Date().toISOString(),
      deadlineAt: new Date(Date.now() + 15000).toISOString(),
    };
    const repository = repositoryWith({
      getMyStanding: vi.fn().mockResolvedValue({
        rank: 3,
        score: 480,
        participantCount: 25,
        aheadRank: 2,
        pointsBehind: 20,
      }),
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        state: 'question_feedback',
        stateVersion: 4,
        currentPosition: 1,
        questionDisplay: 'device',
        question: feedbackQuestion,
        answeredCount: 23,
        correctOptionId: '18700000-0000-0000-0000-000000000001',
        explanation:
          '芬蘭學者佛西士（Forsius）於 1611 年提出最早的色彩系統化排列理論，是色彩體系研究的先驅。',
        optionCounts: [
          { optionId: '18700000-0000-0000-0000-000000000001', count: 18 },
          { optionId: '18700000-0000-0000-0000-000000000002', count: 5 },
        ],
        myFeedback: {
          answerStatus: 'correct',
          selectedOptionId: '18700000-0000-0000-0000-000000000001',
          scoreDelta: 120,
        },
      }),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: '✓ 答對了！+120 分' }),
    ).toBeVisible();
    // 非全屏：跟 screen_only 的全屏結果不同，標題仍在。
    expect(screen.getByText('課堂挑戰')).toBeVisible();
    expect(
      screen.getByText('最早提出色彩排列系統化理論的學者是:'),
    ).toBeVisible();
    expect(
      screen.getByText('A. 佛西士（Forsius）（18 人）', { exact: false }),
    ).toBeVisible();
    expect(
      document.querySelector('.live-distribution__fill--correct'),
    ).not.toBeNull();
    expect(screen.getByText('教師引導解析:')).toBeVisible();
    expect(screen.getByText(/芬蘭學者佛西士/u)).toBeVisible();
    // 名次卡（PersonalStanding）靠 getMyStanding 非同步取回，先等分數這行
    // 出現再讀「目前第 n 名／共 m 人」——這段文字是同一個 <p> 內兩段文字
    // 節點（中間插了 <strong>），用 getByText 逐段比對容易被 JSX 換行/縮排
    // 的空白差異絆到，直接讀 textContent 再去空白比對比較穩定。
    expect(await screen.findByText('累積 480 分')).toBeVisible();
    const rankCardText = (
      document.querySelector('.live-standing-card__rank')?.textContent ?? ''
    ).replace(/\s+/gu, '');
    expect(rankCardText).toBe('目前第3名／共25人');
    expect(screen.getByText('等待主持人進入下一題…')).toBeVisible();
  });

  it('shows the personal standing with encouragement between questions', async () => {
    const repository = repositoryWith({
      getMyStanding: vi.fn().mockResolvedValue({
        rank: 2,
        score: 150,
        participantCount: 5,
        aheadRank: 1,
        pointsBehind: 30,
      }),
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        state: 'question_feedback',
        stateVersion: 4,
        currentPosition: 1,
        questionDisplay: 'screen_only',
        question: screenOnlyQuestion,
        answeredCount: 3,
        correctOptionId: '18700000-0000-0000-0000-000000000001',
        explanation: null,
        optionCounts: [],
        myFeedback: {
          answerStatus: 'correct',
          selectedOptionId: '18700000-0000-0000-0000-000000000001',
          scoreDelta: 150,
        },
      }),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    // 雙螢幕模式的題間結果佔滿全屏：綠底、白勾、加分與名次，且不顯示
    // ColorPlay Live／課堂挑戰標題。
    expect(await screen.findByText('答對了！')).toBeVisible();
    expect(screen.getByRole('status').className).toContain(
      'live-result-screen--correct',
    );
    expect(screen.getByText('本題 +150 分')).toBeVisible();
    expect(await screen.findByText('目前第 2 名')).toBeVisible();
    expect(screen.queryByText('課堂挑戰')).toBeNull();
    expect(screen.queryByText('ColorPlay Live')).toBeNull();
    expect(screen.queryByText(/（\d+ 人）/u)).toBeNull();
  });

  // 批⑤a 公會團體戰:LiveSessionState 目前沒有 waiting-for-next 的既有
  // fixture,依 live-phase-view.ts 的 participantView() 建構一個——
  // question_open + waitingForNext:true 落在 waiting-for-next 分支。
  it('dresses the student session as a night guild raid with a camp fire while waiting', async () => {
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        state: 'question_open',
        stateVersion: 3,
        currentPosition: 1,
        waitingForNext: true,
      }),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(await screen.findByText('已加入這場挑戰！')).toBeVisible();
    expect(
      document.querySelector('.live-session-shell.scene-night.live-guild-raid'),
    ).not.toBeNull();
    const fire = document.querySelector('.live-waiting .camp-fire');
    expect(fire).not.toBeNull();
    expect(fire).toHaveAttribute('aria-hidden', 'true');
    expect(fire).toHaveTextContent('');
  });
});
