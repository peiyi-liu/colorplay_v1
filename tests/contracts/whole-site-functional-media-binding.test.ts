import { describe, expect, it } from 'vitest';
import { createMediaHookBinding } from '../../scripts/concurrency/media-hook-binding';
describe('media hooks retain one owned run and signal', () => {
  it('refuses a second policy rather than silently replacing ownership', () => {
    const controller = new AbortController();
    const binding = createMediaHookBinding(controller.signal);
    binding.bind({ signal: controller.signal });
    expect(() => {
      binding.bind({ signal: controller.signal });
    }).toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
  });
  it('does not swap out the actor run abort signal', () => {
    const binding = createMediaHookBinding(new AbortController().signal);
    expect(() => {
      binding.bind({ signal: new AbortController().signal });
    }).toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
  });
});
