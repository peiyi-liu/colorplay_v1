export type BookPaginationBlock = Readonly<{
  groupKey?: string;
  keepWithNext?: boolean;
  key: string;
  splittable: boolean;
  text?: string;
}>;

export type BookPageItem = Readonly<{
  blockKey: string;
  groupKey?: string;
  key: string;
  text?: string;
}>;

export type BookPage = Readonly<{
  items: readonly BookPageItem[];
  overflowFallback: boolean;
}>;

type PaginateBookBlocksOptions = Readonly<{
  blocks: readonly BookPaginationBlock[];
  measureElement: HTMLElement;
  sourceElement: HTMLElement;
}>;

function clonePageItem(
  item: BookPageItem,
  sourceNodes: ReadonlyMap<string, HTMLElement>,
) {
  const sourceNode = sourceNodes.get(item.blockKey);
  if (!sourceNode) return null;
  const clone = sourceNode.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-book-block-key');
  if (item.text !== undefined) clone.textContent = item.text;
  return clone;
}

function mergeGroupedListClone(target: HTMLElement, source: HTMLElement) {
  const targetList = target.querySelector<HTMLOListElement | HTMLUListElement>(
    '.review-card-markdown > :is(ol, ul)',
  );
  const sourceList = source.querySelector<HTMLOListElement | HTMLUListElement>(
    '.review-card-markdown > :is(ol, ul)',
  );
  if (targetList === null) return false;
  if (sourceList?.tagName !== targetList.tagName) return false;
  targetList.append(...Array.from(sourceList.children));
  return true;
}

function clonePageItems(
  items: readonly BookPageItem[],
  sourceNodes: ReadonlyMap<string, HTMLElement>,
) {
  const clones: HTMLElement[] = [];
  let previousGroupKey: string | undefined;
  for (const item of items) {
    const clone = clonePageItem(item, sourceNodes);
    if (!clone) continue;
    const previousClone = clones.at(-1);
    if (
      item.groupKey !== undefined &&
      item.groupKey === previousGroupKey &&
      previousClone &&
      mergeGroupedListClone(previousClone, clone)
    ) {
      continue;
    }
    clones.push(clone);
    previousGroupKey = item.groupKey;
  }
  return clones;
}

function fitsPage(
  items: readonly BookPageItem[],
  measureElement: HTMLElement,
  sourceNodes: ReadonlyMap<string, HTMLElement>,
) {
  const clones = clonePageItems(items, sourceNodes);
  measureElement.replaceChildren(...clones);
  return measureElement.scrollHeight <= measureElement.clientHeight;
}

function preferredBreakLength(characters: readonly string[], length: number) {
  const minimum = Math.max(1, length - 24);
  for (let index = length; index >= minimum; index -= 1) {
    if (/^[\s，。；：！？、]$/u.test(characters[index - 1] ?? '')) {
      return index;
    }
  }
  return length;
}

function fittingPrefixLength(
  currentPage: readonly BookPageItem[],
  block: BookPaginationBlock,
  remainingText: string,
  consumedLength: number,
  measureElement: HTMLElement,
  sourceNodes: ReadonlyMap<string, HTMLElement>,
) {
  const characters = Array.from(remainingText);
  let low = 1;
  let high = characters.length;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate: BookPageItem = {
      blockKey: block.key,
      ...(block.groupKey === undefined ? {} : { groupKey: block.groupKey }),
      key: `${block.key}:${String(consumedLength)}-${String(consumedLength + middle)}`,
      text: characters.slice(0, middle).join(''),
    };
    if (fitsPage([...currentPage, candidate], measureElement, sourceNodes)) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return preferredBreakLength(characters, best);
}

export function paginateBookBlocks({
  blocks,
  measureElement,
  sourceElement,
}: PaginateBookBlocksOptions): readonly BookPage[] {
  if (measureElement.clientHeight <= 0 || measureElement.clientWidth <= 0) {
    return [];
  }

  const sourceNodes = new Map(
    Array.from(
      sourceElement.querySelectorAll<HTMLElement>('[data-book-block-key]'),
    ).map((node) => [node.dataset.bookBlockKey ?? '', node] as const),
  );
  const pages: BookPage[] = [];
  let currentPage: BookPageItem[] = [];

  const finishPage = () => {
    if (currentPage.length === 0) return;
    pages.push({ items: currentPage, overflowFallback: false });
    currentPage = [];
  };

  for (const [blockIndex, block] of blocks.entries()) {
    const fullItem: BookPageItem = {
      blockKey: block.key,
      ...(block.groupKey === undefined ? {} : { groupKey: block.groupKey }),
      key: block.key,
      ...(block.text === undefined ? {} : { text: block.text }),
    };

    const nextBlock = blocks[blockIndex + 1];
    if (
      block.keepWithNext &&
      nextBlock !== undefined &&
      currentPage.length > 0
    ) {
      const nextItem: BookPageItem = {
        blockKey: nextBlock.key,
        ...(nextBlock.groupKey === undefined
          ? {}
          : { groupKey: nextBlock.groupKey }),
        key: nextBlock.key,
        ...(nextBlock.text === undefined ? {} : { text: nextBlock.text }),
      };
      const nextCanBeginOnCurrentPage =
        nextBlock.splittable && nextBlock.text
          ? fittingPrefixLength(
              [...currentPage, fullItem],
              nextBlock,
              nextBlock.text,
              0,
              measureElement,
              sourceNodes,
            ) > 0
          : fitsPage(
              [...currentPage, fullItem, nextItem],
              measureElement,
              sourceNodes,
            );
      if (!nextCanBeginOnCurrentPage) finishPage();
    }

    if (!block.splittable || !block.text) {
      if (!fitsPage([...currentPage, fullItem], measureElement, sourceNodes)) {
        finishPage();
      }
      if (fitsPage([fullItem], measureElement, sourceNodes)) {
        currentPage.push(fullItem);
      } else {
        pages.push({ items: [fullItem], overflowFallback: true });
      }
      continue;
    }

    let remainingText = block.text;
    let consumedLength = 0;
    while (remainingText.length > 0) {
      const remainingItem: BookPageItem = {
        blockKey: block.key,
        ...(block.groupKey === undefined ? {} : { groupKey: block.groupKey }),
        key: `${block.key}:${String(consumedLength)}-end`,
        text: remainingText,
      };
      if (
        fitsPage([...currentPage, remainingItem], measureElement, sourceNodes)
      ) {
        currentPage.push(remainingItem);
        remainingText = '';
        continue;
      }

      const fittingLength = fittingPrefixLength(
        currentPage,
        block,
        remainingText,
        consumedLength,
        measureElement,
        sourceNodes,
      );
      if (fittingLength === 0 && currentPage.length > 0) {
        finishPage();
        continue;
      }
      if (fittingLength === 0) {
        pages.push({ items: [remainingItem], overflowFallback: true });
        remainingText = '';
        continue;
      }

      const characters = Array.from(remainingText);
      const safeLength = fittingLength;
      currentPage.push({
        blockKey: block.key,
        ...(block.groupKey === undefined ? {} : { groupKey: block.groupKey }),
        key: `${block.key}:${String(consumedLength)}-${String(consumedLength + safeLength)}`,
        text: characters.slice(0, safeLength).join(''),
      });
      remainingText = characters.slice(safeLength).join('').trimStart();
      consumedLength += safeLength;
      if (remainingText.length > 0) finishPage();
    }
  }

  finishPage();
  measureElement.replaceChildren();
  return pages.length > 0 ? pages : [{ items: [], overflowFallback: false }];
}
