import { useState } from 'react';

import chapter1School from '../../../assets/learning-map/chapter-1-school.png';
import chapter2Workshop from '../../../assets/learning-map/chapter-2-workshop.png';
import chapter3LibraryTower from '../../../assets/learning-map/chapter-3-library-tower.png';
import chapter4Observatory from '../../../assets/learning-map/chapter-4-observatory.png';
import chapter5ForestAcademy from '../../../assets/learning-map/chapter-5-forest-academy.png';
import chapter6MasterHall from '../../../assets/learning-map/chapter-6-master-hall.png';
import constructionOverlay from '../../../assets/learning-map/construction-overlay.png';
import lockedCloud from '../../../assets/learning-map/locked-cloud.png';
import { Icon, type IconName } from '../../../components/ui/icons';
import type {
  ChapterAccessState,
  StudentChapterMapEntry,
} from '../api/chapter-map';
import { anchorStyle, type ChapterGroundAnchor } from './chapter-map-layout';

const buildingArt: Readonly<Record<string, string>> = {
  'chapter-1': chapter1School,
  'chapter-2': chapter2Workshop,
  'chapter-3': chapter3LibraryTower,
  'chapter-4': chapter4Observatory,
  'chapter-5': chapter5ForestAcademy,
  'chapter-6': chapter6MasterHall,
};

const accessPresentation: Readonly<
  Record<ChapterAccessState, { icon: IconName; label: string }>
> = {
  available: { icon: 'star', label: '可進入' },
  completed: { icon: 'check', label: '已完成' },
  content_unavailable: { icon: 'alert', label: '內容準備中' },
  locked: { icon: 'lock', label: '未解鎖' },
};

type ChapterMapBuildingProps = Readonly<{
  anchor: ChapterGroundAnchor;
  chapter: StudentChapterMapEntry;
  onSelect: (chapterId: string) => void;
  selected: boolean;
}>;

export function ChapterMapBuilding({
  anchor,
  chapter,
  onSelect,
  selected,
}: ChapterMapBuildingProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const art = buildingArt[chapter.stableCode];
  const state = accessPresentation[chapter.accessState];

  return (
    <li
      className="chapter-map__building"
      data-access-state={chapter.accessState}
      data-ground-x={anchor.x}
      data-ground-y={anchor.y}
      data-selected={selected ? 'true' : 'false'}
      style={anchorStyle(anchor)}
    >
      <button
        aria-label={`Chapter ${String(chapter.sortOrder)} ${chapter.title} ${state.label}`}
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
        </span>
        <span
          aria-hidden="true"
          className="chapter-map__sign-chain chapter-map__sign-chain--left"
        />
        <span
          aria-hidden="true"
          className="chapter-map__sign-chain chapter-map__sign-chain--right"
        />
        <span className="chapter-map__building-caption">
          <span className="chapter-map__building-label">
            <span className="chapter-map__building-chapter">
              Chapter {chapter.sortOrder}
            </span>
            <strong>{chapter.title}</strong>
          </span>
          <span className="chapter-map__status-medal">
            <Icon data-icon={state.icon} name={state.icon} size={14} />
            <span>{state.label}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
