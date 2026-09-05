import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AdminShell } from './admin-shell';
// JSDOM has no native dialog methods. Real focus trapping is checked in Chromium.
const dialogDescriptors = ['showModal', 'close'].map(
  (name) =>
    [
      name,
      Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
    ] as const,
);
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    },
  });
});
afterAll(() => {
  for (const [name, descriptor] of dialogDescriptors) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

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
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AdminShell />}>
            <Route element={<p>安全總覽內容</p>} path="/admin" />
            <Route
              element={<p>管理員清單內容</p>}
              path="/admin/access/admins"
            />
            <Route element={<p>教師帳號內容</p>} path="/admin/teachers" />
            <Route
              element={<p>邀請清單內容</p>}
              path="/admin/access/invitations"
            />
            <Route
              element={<p>session 清單內容</p>}
              path="/admin/access/sessions"
            />
            <Route element={<p>資料查核內容</p>} path="/admin/data" />
            <Route element={<p>稽核內容</p>} path="/admin/audit" />
            <Route element={<p>健康內容</p>} path="/admin/health" />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
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
      '日常營運',
      '身分與存取',
      '資料查核',
      '稽核',
      '系統健康',
    ]) {
      expect(within(nav).getAllByText(label).length).toBeGreaterThan(0);
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

  it('links the data navigation to the catalog-derived landing page', () => {
    stubWide(true);
    renderShell('/admin');

    expect(screen.getByRole('link', { name: '資料查核' })).toHaveAttribute(
      'href',
      '/admin/data',
    );
  });

  it('links teacher-account operations from identity and access', () => {
    stubWide(true);
    renderShell('/admin/teachers');

    expect(screen.getByRole('link', { name: '教師帳號' })).toHaveAttribute(
      'href',
      '/admin/teachers',
    );
    expect(screen.getByRole('link', { name: '教師帳號' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('教師帳號內容')).toBeInTheDocument();
  });

  it('keeps the sidebar persistently visible at wide viewports without a MENU toggle', () => {
    stubWide(true);
    renderShell('/admin');

    expect(
      screen.queryByRole('button', { name: '開啟導覽' }),
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

    const toggle = screen.getByRole('button', { name: '開啟導覽' });
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

    const toggle = screen.getByRole('button', { name: '開啟導覽' });
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

    await user.click(screen.getByRole('button', { name: '開啟導覽' }));
    await user.click(screen.getByRole('link', { name: '稽核紀錄' }));

    expect(await screen.findByText('稽核內容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開啟導覽' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
