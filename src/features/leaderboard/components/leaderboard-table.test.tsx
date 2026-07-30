import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BlookInventoryItem } from '../../inventory/types';
import type { ClassroomLeaderboard } from '../types';
import { LeaderboardTable } from './leaderboard-table';

const blooks: readonly BlookInventoryItem[] = [
  {
    costTokens: 0,
    emoji: '🦊',
    equipped: false,
    id: '50000000-0000-0000-0000-000000000001',
    name: '小狐狸',
    owned: false,
    stableCode: 'little_fox',
  },
  {
    costTokens: 100,
    emoji: '🐳',
    equipped: false,
    id: '50000000-0000-0000-0000-000000000002',
    name: '藍鯨',
    owned: false,
    stableCode: 'blue_whale',
  },
];
const board: ClassroomLeaderboard = {
  classroomId: 'ca000000-0000-4000-8000-000000000001',
  classroomName: '色彩一班',
  generatedAt: '2026-07-17T02:00:00.000Z',
  memberCount: 12,
  selfEntry: {
    activeBlookId: null,
    frameGradientEnd: null,
    frameGradientStart: null,
    displayName: '本人',
    isSelf: true,
    rank: 12,
    totalXp: 0,
  },
  topEntries: [
    {
      activeBlookId: blooks[1]?.id ?? null,
      frameGradientEnd: null,
      frameGradientStart: null,
      displayName: '子安',
      isSelf: false,
      rank: 1,
      totalXp: 1200,
    },
    {
      activeBlookId: '59999999-0000-0000-0000-000000000099',
      frameGradientEnd: null,
      frameGradientStart: null,
      displayName: '阿美',
      isSelf: false,
      rank: 2,
      totalXp: 0,
    },
  ],
};

describe('LeaderboardTable', () => {
  it('preserves non-alphabetic server order and resolves safe Blook presentation', () => {
    render(<LeaderboardTable blooks={blooks} leaderboard={board} />);
    const rows = within(screen.getByRole('table', { name: '色彩一班 Top 10' }))
      .getAllByRole('row')
      .slice(1);
    // 藍鯨無自製 SVG → 頭像磚以 emoji 備援呈現（🐳 併入 textContent）。
    expect(
      rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent),
    ).toEqual(['🐳子安', '阿美']);
    // owner 0730 #6：頭像磚（大廳同款）取代 Blook 名稱欄；未知代碼安全退回。
    expect(
      document.querySelectorAll('.leaderboard-blook__avatar'),
    ).toHaveLength(3);
    expect(screen.getAllByText('0 XP')).toHaveLength(2);
    expect(document.body).not.toHaveTextContent('59999999-');
  });

  it('marks the top three rows with rank-tier classes for DC gold/silver/bronze row backgrounds', () => {
    const topThree = board.topEntries[0];
    const second = board.topEntries[1];
    if (!topThree || !second) throw new Error('TOP_ENTRY_FIXTURE_MISSING');
    const topThreeBoard: ClassroomLeaderboard = {
      ...board,
      topEntries: [
        topThree,
        second,
        { ...topThree, displayName: '第三名', rank: 3 },
        { ...topThree, displayName: '第四名', rank: 4 },
      ],
    };
    render(<LeaderboardTable blooks={blooks} leaderboard={topThreeBoard} />);
    const rows = within(screen.getByRole('table', { name: '色彩一班 Top 10' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows[0]).toHaveClass('leaderboard-table__row--gold');
    expect(rows[1]).toHaveClass('leaderboard-table__row--silver');
    expect(rows[2]).toHaveClass('leaderboard-table__row--bronze');
    expect(rows[3]?.className ?? '').not.toMatch(
      /leaderboard-table__row--(gold|silver|bronze)/u,
    );
  });

  it('shows an out-of-list self rank separately with a visible self label', () => {
    render(<LeaderboardTable blooks={blooks} leaderboard={board} />);
    const self = screen.getByRole('region', { name: '我的班級名次' });
    expect(self).toHaveTextContent('第 12 名');
    expect(self).toHaveTextContent('本人');
    expect(self).toHaveTextContent('這是你');
  });

  it('does not duplicate self already present in Top 10 and accepts owner null self', () => {
    const topEntry = board.topEntries[0];
    if (!topEntry) throw new Error('TOP_ENTRY_FIXTURE_MISSING');
    const inTop = {
      ...board,
      selfEntry: { ...topEntry, isSelf: true },
      topEntries: [{ ...topEntry, isSelf: true }],
    };
    const view = render(
      <LeaderboardTable blooks={blooks} leaderboard={inTop} />,
    );
    expect(screen.queryByRole('region', { name: '我的班級名次' })).toBeNull();
    expect(screen.getByText('這是你')).toBeVisible();
    view.rerender(
      <LeaderboardTable
        blooks={blooks}
        leaderboard={{ ...board, selfEntry: null }}
      />,
    );
    expect(screen.queryByRole('region', { name: '我的班級名次' })).toBeNull();
  });
});
