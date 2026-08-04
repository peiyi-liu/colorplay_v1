import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { StudentChapterMapEntry } from '../api/chapter-map';
import {
  CHAPTER_MAP_WORLD,
  getChapterGroundAnchor,
} from './chapter-map-layout';

type ChapterMapCameraProps = Readonly<{
  activeChapter: Pick<StudentChapterMapEntry, 'chapterId' | 'sortOrder'>;
  children: ReactNode;
}>;

type DragPosition = Readonly<{
  pointerId: number;
  startScrollLeft: number;
  startX: number;
}>;

const KEYBOARD_PAN_STEP = 160;
const CHAPTER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;

const clampScrollLeft = (viewport: HTMLDivElement, next: number): number =>
  Math.min(
    Math.max(next, 0),
    Math.max(viewport.scrollWidth - viewport.clientWidth, 0),
  );

export function ChapterMapCamera({
  activeChapter,
  children,
}: ChapterMapCameraProps): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragPosition | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const anchor = getChapterGroundAnchor(activeChapter.sortOrder);
    const worldScale = viewport.scrollWidth / CHAPTER_MAP_WORLD.width;
    viewport.scrollLeft = clampScrollLeft(
      viewport,
      anchor.x * worldScale - viewport.clientWidth / 2,
    );
  }, [activeChapter.chapterId, activeChapter.sortOrder]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    let next: number;

    switch (event.key) {
      case 'ArrowLeft':
        next = viewport.scrollLeft - KEYBOARD_PAN_STEP;
        break;
      case 'ArrowRight':
        next = viewport.scrollLeft + KEYBOARD_PAN_STEP;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = viewport.scrollWidth - viewport.clientWidth;
        break;
      default:
        return;
    }

    event.preventDefault();
    viewport.scrollLeft = clampScrollLeft(viewport, next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest('button, a'))
    ) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startScrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;

    event.currentTarget.scrollLeft = clampScrollLeft(
      event.currentTarget,
      drag.startScrollLeft + drag.startX - event.clientX,
    );
  };

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-label="村莊地圖探索區"
      className="chapter-map__viewport"
      onKeyDown={handleKeyDown}
      onPointerCancel={finishPointerDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      ref={viewportRef}
      role="region"
      tabIndex={0}
    >
      {children}
      <div className="chapter-map__camera-guide">
        <span className="chapter-map__camera-instruction">拖曳探索村莊</span>
        <ol aria-label="六章位置" className="chapter-map__positions">
          {CHAPTER_POSITIONS.map((position) => (
            <li
              aria-current={
                position === activeChapter.sortOrder ? 'step' : undefined
              }
              key={position}
            >
              <span aria-hidden="true">{position}</span>
              <span className="sr-only">第 {position} 章</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
