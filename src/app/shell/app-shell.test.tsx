import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('provides a skip link, banner, and main outlet region', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '跳到主要內容' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('uses a labelled home link without treating navigation as a route CTA', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'ColorPlay 首頁' }),
    ).toHaveAttribute('href', '/');
    expect(document.querySelectorAll('[data-acceptance-target]')).toHaveLength(
      0,
    );
  });
});
