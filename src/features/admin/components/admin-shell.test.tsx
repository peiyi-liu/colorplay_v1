import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminShell } from './admin-shell';

function stubWide(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => false,
    matches,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  }));
}

function renderShell(initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route element={<p>安全總覽內容</p>} path="/admin" />
          <Route element={<p>管理員清單內容</p>} path="/admin/access/admins" />
          <Route
            element={<p>邀請清單內容</p>}
            path="/admin/access/invitations"
          />
          <Route
            element={<p>session 清單內容</p>}
            path="/admin/access/sessions"
          />
          <Route element={<p>稽核內容</p>} path="/admin/audit" />
          <Route element={<p>健康內容</p>} path="/admin/health" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not render its own <main> landmark (AppShell already owns the single #main-content landmark)', () => {
    stubWide(true);
    renderShell('/admin');

    expect(document.querySelector('main')).not.toBeInTheDocument();
  });

  it('renders the five sidebar groups and passes through routed content', () => {
    stubWide(true);
    renderShell('/admin');

    const nav = screen.getByRole('navigation', { name: '管理主控台導覽' });
    for (const label of [
      '總覽',
      '身分與存取',
      '資料瀏覽',
      '稽核',
      '系統健康',
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('安全總覽內容')).toBeInTheDocument();
  });

  it('marks only the active route link with aria-current', () => {
    stubWide(true);
    renderShell('/admin/access/admins');

    expect(screen.getByRole('link', { name: '管理員' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '安全總覽' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the sidebar persistently visible at wide viewports without a MENU toggle', () => {
    stubWide(true);
    renderShell('/admin');

    expect(
      screen.queryByRole('button', { name: 'MENU' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '管理主控台導覽' }),
    ).toBeVisible();
  });

  it('collapses navigation into a MENU drawer at narrow viewports', async () => {
    const user = userEvent.setup();
    stubWide(false);
    renderShell('/admin');

    const nav = screen.getByRole('navigation', { hidden: true });
    expect(nav).toHaveAttribute('aria-label', '管理主控台導覽');
    expect(nav).not.toBeVisible();

    const toggle = screen.getByRole('button', { name: 'MENU' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('navigation', { name: '管理主控台導覽' }),
    ).toBeVisible();
  });

  it('closes the drawer on Escape and restores focus to the MENU toggle', async () => {
    const user = userEvent.setup();
    stubWide(false);
    renderShell('/admin');

    const toggle = screen.getByRole('button', { name: 'MENU' });
    await user.click(toggle);
    expect(
      screen.getByRole('navigation', { name: '管理主控台導覽' }),
    ).toBeVisible();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
    expect(document.activeElement).toBe(toggle);
  });

  it('closes the drawer automatically after navigating to a new route', async () => {
    const user = userEvent.setup();
    stubWide(false);
    renderShell('/admin');

    await user.click(screen.getByRole('button', { name: 'MENU' }));
    await user.click(screen.getByRole('link', { name: '稽核紀錄' }));

    expect(await screen.findByText('稽核內容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MENU' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
