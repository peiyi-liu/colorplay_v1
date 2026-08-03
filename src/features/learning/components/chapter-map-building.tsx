import { useState } from 'react';

import chapter1School from '../../../assets/learning-map/chapter-1-school.png';
import chapter2Workshop from '../../../assets/learning-map/chapter-2-workshop.png';
import chapter3LibraryTower from '../../../assets/learning-map/chapter-3-library-tower.png';
import chapter4Observatory from '../../../assets/learning-map/chapter-4-observatory.png';
import chapter5ForestAcademy from '../../../assets/learning-map/chapter-5-forest-academy.png';
import chapter6MasterHall from '../../../assets/learning-map/chapter-6-master-hall.png';
import completionEmblem from '../../../assets/learning-map/completion-emblem.png';
import constructionOverlay from '../../../assets/learning-map/construction-overlay.png';
import lockedCloud from '../../../assets/learning-map/locked-cloud.png';
import type {
  ChapterAccessState,
  StudentChapterMapEntry,
} from '../api/chapter-map';

const buildingArt: Readonly<Record<string, string>> = {
  'chapter-1': chapter1School,
  'chapter-2': chapter2Workshop,
  'chapter-3': chapter3LibraryTower,
  'chapter-4': chapter4Observatory,
  'chapter-5': chapter5ForestAcademy,
  'chapter-6': chapter6MasterHall,
};

const accessLabels: Readonly<Record<ChapterAccessState, string>> = {
  available: '可進入',
  completed: '已完成',
  content_unavailable: '內容準備中',
  locked: '尚未解鎖',
};

type ChapterMapBuildingProps = Readonly<{
  chapter: StudentChapterMapEntry;
  onSelect: (chapterId: string) => void;
  selected: boolean;
}>;

export function ChapterMapBuilding({
  chapter,
  onSelect,
  selected,
}: ChapterMapBuildingProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const art = buildingArt[chapter.stableCode];
  const stateLabel = accessLabels[chapter.accessState];

  return (
    <li
      className="chapter-map__building"
      data-access-state={chapter.accessState}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        aria-label={`Chapter ${String(chapter.sortOrder)} ${chapter.title} ${stateLabel}`}
        aria-pressed={selected}
        className="chapter-map__building-button"
        onClick={() => {
          onSelect(chapter.chapterId);
        }}
        type="button"
      >
        <span aria-hidden="true" className="chapter-map__building-visual">
          {art && !imageFailed ? (
            <img
              alt=""
              aria-hidden="true"
              className="chapter-map__building-art"
              data-testid="chapter-building-art"
              decoding="async"
              onError={() => {
                setImageFailed(true);
              }}
              src={art}
            />
          ) : (
            <span
              className="chapter-map__building-fallback"
              data-testid="chapter-building-fallback"
            />
          )}
          {chapter.accessState === 'locked' ? (
            <img
              alt=""
              aria-hidden="true"
              className="chapter-map__cloud"
              src={lockedCloud}
            />
          ) : null}
          {chapter.accessState === 'content_unavailable' ? (
            <img
              alt=""
              aria-hidden="true"
              className="chapter-map__construction"
              src={constructionOverlay}
            />
          ) : null}
          {chapter.accessState === 'completed' ? (
            <img
              alt=""
              aria-hidden="true"
              className="chapter-map__completion"
              src={completionEmblem}
            />
          ) : null}
        </span>
        <span className="chapter-map__building-label">
          <span className="chapter-map__building-chapter">
            Chapter {chapter.sortOrder}
          </span>
          <strong>{chapter.title}</strong>
          <span className="chapter-map__building-state">{stateLabel}</span>
        </span>
      </button>
    </li>
  );
}
