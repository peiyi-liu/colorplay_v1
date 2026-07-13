import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoutePage } from './route-page';

describe('RoutePage', () => {
  it('renders its heading and supporting message', () => {
    render(
      <RoutePage heading="登入" message="使用個人 Email 進入 ColorPlay" />,
    );
    expect(screen.getByRole('heading', { name: '登入' })).toBeVisible();
    expect(screen.getByText('使用個人 Email 進入 ColorPlay')).toBeVisible();
  });
});
