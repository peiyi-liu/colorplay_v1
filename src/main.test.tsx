import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('application bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
  });

  it('mounts ColorPlay into the application root', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);

    await act(async () => {
      await import('./main');
    });

    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
  });

  it('fails with a stable error when the application root is missing', async () => {
    await expect(import('./main')).rejects.toThrow('APP_ROOT_MISSING');
  });
});
