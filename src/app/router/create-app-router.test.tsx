import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './create-app-router';

describe('createAppRouter', () => {
  it.each([
    ['/login', '登入'],
    ['/app', '學習大廳'],
    ['/unauthorized', '沒有權限'],
  ])('renders %s', async (path, heading) => {
    window.history.replaceState({}, '', path);
    render(<RouterProvider router={createAppRouter()} />);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  });
});
