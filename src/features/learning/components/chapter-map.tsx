import { useState } from 'react';

import adventurerIdle from '../../../assets/learning-map/adventurer-idle.png';
import forestVillageBase from '../../../assets/learning-map/forest-village-base.webp';
import { BlookArt } from '../../../components/ui/blook-art';
import type { BlookInventoryItem } from '../../inventory/types';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMapBuilding } from './chapter-map-building';
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

  return (
    <div className="chapter-map">
      <div className="chapter-map__scene">
        <img
          alt=""
          aria-hidden="true"
          className="chapter-map__base"
          decoding="async"
          src={forestVillageBase}
        />
        <ol aria-label="六章學習地圖" className="chapter-map__buildings">
          {chapters.map((chapter) => (
            <ChapterMapBuilding
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
        >
          <BlookArt
            emoji={equippedBlook?.emoji}
            size={40}
            stableCode={equippedBlook?.stableCode ?? 'little_fox'}
          />
        </span>
        <span aria-hidden="true" className="chapter-map__adventurer">
          <img alt="" aria-hidden="true" src={adventurerIdle} />
        </span>
      </div>
      <ChapterMapPanel chapter={selectedChapter} />
    </div>
  );
}
