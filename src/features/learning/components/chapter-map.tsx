import { useState } from 'react';

import adventurerIdle from '../../../assets/learning-map/adventurer-idle.png';
import forestVillageBase from '../../../assets/learning-map/forest-village-base.webp';
import { BlookArt } from '../../../components/ui/blook-art';
import type { BlookInventoryItem } from '../../inventory/types';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMapBuilding } from './chapter-map-building';
import { ChapterMapCamera } from './chapter-map-camera';
import {
  ADVENTURER_GROUND_ANCHOR,
  CHAPTER_MAP_WORLD,
  anchorStyle,
  getChapterGroundAnchor,
} from './chapter-map-layout';
import { ChapterMapPanel } from './chapter-map-panel';

const initialSelection = (
  chapters: readonly StudentChapterMapEntry[],
  requestedId: string | undefined,
): string => {
  if (
    requestedId &&
    chapters.some((chapter) => chapter.chapterId === requestedId)
  ) {
    return requestedId;
  }

  if (chapters.every((chapter) => chapter.accessState === 'completed')) {
    return chapters.at(-1)?.chapterId ?? '';
  }

  return (
    chapters.find((chapter) => chapter.accessState === 'available')
      ?.chapterId ??
    chapters
      .slice()
      .reverse()
      .find((chapter) => chapter.accessState === 'completed')?.chapterId ??
    chapters[0]?.chapterId ??
    ''
  );
};

export function ChapterMap({
  chapters,
  equippedBlook,
  initialChapterId,
}: Readonly<{
  chapters: readonly StudentChapterMapEntry[];
  equippedBlook: BlookInventoryItem | null;
  initialChapterId?: string | undefined;
}>) {
  const [selectedId, setSelectedId] = useState(() =>
    initialSelection(chapters, initialChapterId),
  );
  const selectedChapter =
    chapters.find((chapter) => chapter.chapterId === selectedId) ?? chapters[0];
  const selectedPosition = selectedChapter?.sortOrder ?? 1;

  if (!selectedChapter) return null;

  const selectedAnchor = getChapterGroundAnchor(selectedPosition);

  return (
    <div className="chapter-map">
      <ChapterMapCamera activeChapter={selectedChapter}>
        <div
          className="chapter-map__world"
          data-world-height={CHAPTER_MAP_WORLD.height}
          data-world-width={CHAPTER_MAP_WORLD.width}
        >
          <img
            alt=""
            aria-hidden="true"
            className="chapter-map__base"
            decoding="async"
            draggable={false}
            src={forestVillageBase}
          />
          <ol aria-label="六章學習地圖" className="chapter-map__buildings">
            {chapters.map((chapter) => (
              <ChapterMapBuilding
                anchor={getChapterGroundAnchor(chapter.sortOrder)}
                chapter={chapter}
                key={chapter.chapterId}
                onSelect={setSelectedId}
                selected={chapter.chapterId === selectedChapter.chapterId}
              />
            ))}
          </ol>
          <span
            aria-hidden="true"
            className="chapter-map__companion"
            data-position={selectedPosition}
            data-testid="equipped-blook-badge"
            style={anchorStyle(selectedAnchor)}
          >
            <BlookArt
              emoji={equippedBlook?.emoji}
              size={40}
              stableCode={equippedBlook?.stableCode ?? 'little_fox'}
            />
          </span>
          <span
            aria-hidden="true"
            className="chapter-map__adventurer"
            style={anchorStyle(ADVENTURER_GROUND_ANCHOR)}
          >
            <img alt="" aria-hidden="true" src={adventurerIdle} />
          </span>
        </div>
      </ChapterMapCamera>
      <div className="chapter-map__dialogue-lane">
        <ChapterMapPanel chapter={selectedChapter} />
      </div>
    </div>
  );
}
