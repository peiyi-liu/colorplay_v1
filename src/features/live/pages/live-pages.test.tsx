import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LiveRepositoryError } from '../types';
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

    await user.type(screen.getByLabelText('輸入 6 位加入代碼'), '123456');
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

    await user.type(screen.getByLabelText('輸入 6 位加入代碼'), 'nope12');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(await screen.findByText('請輸入六位數字課堂代碼')).toBeVisible();
  });

  it('renders only the requested join copy and one semantic six-digit input', async () => {
    renderWith(<LiveJoinPage repository={repositoryWith({})} />);
    const user = userEvent.setup();

    expect(
      screen.getByRole('heading', { name: '加入 Live 課堂' }),
    ).toBeVisible();
    expect(
      screen.getByText('輸入老師公布的課堂代碼，即可進入等待室。'),
    ).toBeVisible();
    expect(screen.queryByText('ColorPlay Live')).not.toBeInTheDocument();
    expect(screen.queryByText('加入課堂挑戰')).not.toBeInTheDocument();
    expect(document.querySelector('.live-join--portal.scene-night')).not.toBeNull();

    const input = screen.getByLabelText('輸入 6 位加入代碼');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('maxlength', '6');
    expect(document.querySelectorAll('.live-join__digit')).toHaveLength(6);
    expect(document.querySelector('.rune-slots')).toBeNull();

    await user.type(input, '012');

    expect(
      Array.from(document.querySelectorAll('.live-join__digit')).map(
        (digit) => digit.textContent,
      ),
    ).toEqual(['0', '1', '2', '', '', '']);
  });

  it('shows the safe server error only after a failed join', async () => {
    const join = vi
      .fn()
      .mockRejectedValue(new LiveRepositoryError('JOIN_INVALID_CODE'));
    renderWith(<LiveJoinPage repository={repositoryWith({ join })} />);
    const user = userEvent.setup();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('輸入 6 位加入代碼'), '123456');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(
      await screen.findByText('代碼無效或課堂尚未開放，請向老師確認。'),
    ).toBeVisible();
  });
});

describe('LiveSessionPage (participant)', () => {
  it('shows the waiting room with challenge, connection, question, and online status', async () => {
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repositoryWith({})}
        sessionId={SESSION_ID}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: '課堂挑戰' }),
    ).toBeVisible();
    expect(screen.getByText('等待主持人開始…')).toBeVisible();
    expect(screen.getByText('等待開始')).toBeVisible();
    expect(screen.getByText('連線正常')).toBeVisible();
    expect(screen.getByText('3 人在線')).toBeVisible();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

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
      await screen.findByText('答案已送出，等待揭曉…'),
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

  it('shows the projector reminder and four visible A/B/C/D response choices', async () => {
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
    expect(screen.getByText('請看投影幕作答')).toBeVisible();
    expect(screen.getByRole('img', { name: '投影機' })).toBeVisible();
    expect(screen.getByText('第 1 / 20 題')).toBeVisible();
    expect(screen.getByRole('timer', { name: '剩餘秒數' })).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(firstOption).toHaveTextContent('A');
    expect(screen.getByRole('button', { name: '選項 B：藍色正方形' })).toHaveTextContent('B');
    expect(screen.getByRole('button', { name: '選項 C：黃色圓形' })).toHaveTextContent('C');
    expect(screen.getByRole('button', { name: '選項 D：綠色菱形' })).toHaveTextContent('D');
  });

  it('shows the actual frozen count when fewer than twenty questions are available', async () => {
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        state: 'question_open',
        stateVersion: 3,
        currentPosition: 1,
        questionCount: 7,
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

    expect(await screen.findByText('第 1 / 7 題')).toBeVisible();
  });

  it('locks one screen-only choice immediately and then waits for reveal', async () => {
    const submitAnswer = vi.fn().mockResolvedValue({ streak: 1 });
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
      submitAnswer,
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();
    const choice = await screen.findByRole('button', {
      name: '選項 C：黃色圓形',
    });

    await user.click(choice);

    await waitFor(() => {
      expect(submitAnswer).toHaveBeenCalledTimes(1);
    });
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(
      screen.getByRole('button', {
        name: /選項 C：黃色圓形.*已選擇/u,
      }),
    ).toHaveClass('ui-option--state-selected');
    expect(
      await screen.findByText('答案已送出，等待揭曉…'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /送出/u })).toBeNull();
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
