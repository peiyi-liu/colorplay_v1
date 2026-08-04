import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMapCamera } from './chapter-map-camera';

const activeChapter = (
  sortOrder: number,
): Pick<StudentChapterMapEntry, 'chapterId' | 'sortOrder'> => ({
  chapterId: `chapter-${String(sortOrder)}`,
  sortOrder,
});

const dimensions = {
  clientWidth: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth',
  ),
  scrollWidth: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollWidth',
  ),
};

let viewportClientWidth = 500;
let viewportScrollWidth = 1000;
let resizeCallback: ResizeObserverCallback | undefined;
const observeResize = vi.fn();
const disconnectResize = vi.fn();

describe('ChapterMapCamera', () => {
  beforeEach(() => {
    viewportClientWidth = 500;
    viewportScrollWidth = 1000;
    resizeCallback = undefined;
    observeResize.mockReset();
    disconnectResize.mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        disconnect = disconnectResize;
        observe = observeResize;
        unobserve = vi.fn();
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => viewportClientWidth,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => viewportScrollWidth,
    });
  });

  afterEach(() => {
    if (dimensions.clientWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        'clientWidth',
        dimensions.clientWidth,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }
    if (dimensions.scrollWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollWidth',
        dimensions.scrollWidth,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    }
    vi.unstubAllGlobals();
  });

  it('centers the active chapter and clamps the camera without moving focus', () => {
    const { rerender } = render(
      <ChapterMapCamera activeChapter={activeChapter(1)}>
        <div>村莊世界</div>
      </ChapterMapCamera>,
    );
    const viewport = screen.getByRole('region', { name: '村莊地圖探索區' });
    expect(viewport.scrollLeft).toBe(0);

    rerender(
      <ChapterMapCamera activeChapter={activeChapter(6)}>
        <div>村莊世界</div>
      </ChapterMapCamera>,
    );

    expect(viewport.scrollLeft).toBe(490);
    expect(viewport).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('supports fixed-step arrow panning and Home/End limits', () => {
    render(
      <ChapterMapCamera activeChapter={activeChapter(2)}>
        <div>村莊世界</div>
      </ChapterMapCamera>,
    );
    const viewport = screen.getByRole('region', { name: '村莊地圖探索區' });
    viewport.scrollLeft = 100;

    expect(fireEvent.keyDown(viewport, { key: 'ArrowRight' })).toBe(false);
    expect(viewport.scrollLeft).toBe(260);
    expect(fireEvent.keyDown(viewport, { key: 'ArrowLeft' })).toBe(false);
    expect(viewport.scrollLeft).toBe(100);
    expect(fireEvent.keyDown(viewport, { key: 'Home' })).toBe(false);
    expect(viewport.scrollLeft).toBe(0);
    expect(fireEvent.keyDown(viewport, { key: 'End' })).toBe(false);
    expect(viewport.scrollLeft).toBe(500);
  });

  it('recenters the unchanged active chapter after viewport and world dimensions change', () => {
    render(
      <ChapterMapCamera activeChapter={activeChapter(6)}>
        <div data-testid="village-world">村莊世界</div>
      </ChapterMapCamera>,
    );
    const viewport = screen.getByRole('region', { name: '村莊地圖探索區' });
    const world = screen.getByTestId('village-world');
    expect(viewport.scrollLeft).toBe(490);
    expect(observeResize).toHaveBeenCalledWith(viewport);
    expect(observeResize).toHaveBeenCalledWith(world);

    viewportClientWidth = 300;
    viewportScrollWidth = 1200;
    viewport.scrollLeft = 0;
    resizeCallback?.([], {} as ResizeObserver);

    expect(viewport.scrollLeft).toBe(738);
    expect(viewport).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('drags blank world directly but leaves button and link gestures alone', () => {
    render(
      <ChapterMapCamera activeChapter={activeChapter(2)}>
        <div data-testid="blank-world">
          <button type="button">章節</button>
          <a href="#chapter">入口</a>
        </div>
      </ChapterMapCamera>,
    );
    const viewport = screen.getByRole('region', { name: '村莊地圖探索區' });
    const capture = vi.fn();
    const release = vi.fn();
    const hasCapture = vi.fn().mockReturnValue(true);
    viewport.setPointerCapture = capture;
    viewport.releasePointerCapture = release;
    viewport.hasPointerCapture = hasCapture;
    viewport.scrollLeft = 300;

    fireEvent.pointerDown(screen.getByTestId('blank-world'), {
      button: 0,
      clientX: 200,
      isPrimary: true,
      pointerId: 7,
    });
    fireEvent.pointerMove(viewport, { clientX: 150, pointerId: 7 });
    fireEvent.pointerUp(viewport, { pointerId: 7 });
    expect(viewport.scrollLeft).toBe(350);
    expect(capture).toHaveBeenCalledWith(7);
    expect(release).toHaveBeenCalledWith(7);

    fireEvent.pointerDown(screen.getByRole('button', { name: '章節' }), {
      button: 0,
      clientX: 200,
      pointerId: 8,
    });
    fireEvent.pointerMove(viewport, { clientX: 100, pointerId: 8 });
    fireEvent.pointerDown(screen.getByRole('link', { name: '入口' }), {
      button: 0,
      clientX: 200,
      pointerId: 9,
    });
    fireEvent.pointerMove(viewport, { clientX: 100, pointerId: 9 });
    expect(viewport.scrollLeft).toBe(350);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('keeps one primary drag and cleans it up on matching lost capture', () => {
    render(
      <ChapterMapCamera activeChapter={activeChapter(2)}>
        <div data-testid="blank-world">村莊世界</div>
      </ChapterMapCamera>,
    );
    const viewport = screen.getByRole('region', { name: '村莊地圖探索區' });
    const capture = vi.fn();
    const release = vi.fn();
    viewport.setPointerCapture = capture;
    viewport.releasePointerCapture = release;
    viewport.hasPointerCapture = vi.fn().mockReturnValue(false);
    viewport.scrollLeft = 300;

    fireEvent.pointerDown(screen.getByTestId('blank-world'), {
      button: 0,
      clientX: 200,
      isPrimary: true,
      pointerId: 7,
    });
    fireEvent.pointerDown(screen.getByTestId('blank-world'), {
      button: 0,
      clientX: 100,
      isPrimary: false,
      pointerId: 8,
    });
    fireEvent.pointerMove(viewport, { clientX: 20, pointerId: 8 });
    expect(viewport.scrollLeft).toBe(300);
    expect(capture).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(viewport, { clientX: 150, pointerId: 7 });
    expect(viewport.scrollLeft).toBe(350);
    fireEvent.lostPointerCapture(viewport, { pointerId: 8 });
    fireEvent.pointerMove(viewport, { clientX: 140, pointerId: 7 });
    expect(viewport.scrollLeft).toBe(360);

    fireEvent.lostPointerCapture(viewport, { pointerId: 7 });
    fireEvent.pointerMove(viewport, { clientX: 100, pointerId: 7 });
    expect(viewport.scrollLeft).toBe(360);
    fireEvent.pointerUp(viewport, { pointerId: 7 });
    expect(release).not.toHaveBeenCalled();
  });

  it('shows six passive positions and marks the active step without storage writes', () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <ChapterMapCamera activeChapter={activeChapter(4)}>
        <div>村莊世界</div>
      </ChapterMapCamera>,
    );

    expect(screen.getByText('拖曳探索村莊')).toBeVisible();
    const indicator = screen.getByRole('list', { name: '六章位置' });
    expect(indicator.querySelectorAll('li')).toHaveLength(6);
    expect(indicator.querySelector('[aria-current="step"]')).toHaveTextContent(
      '4',
    );
    expect(indicator.querySelectorAll('button, a')).toHaveLength(0);
    expect(storageWrite).not.toHaveBeenCalled();
  });
});
