export type ReviewCardMarkdownPaginationBlock = Readonly<{
  groupKey?: string;
  keepWithNext?: boolean;
  markdown: string;
  splittable: boolean;
}>;

type MarkdownChunk = Readonly<{
  groupKey?: string;
  keepWithNext?: boolean;
  markdown: string;
}>;

const listItemPattern = /^( {0,3})(?:[-+*]|\d+[.)])\s+/u;
const atxHeadingPattern = /^ {0,3}#{1,6}(?:\s+|$)/u;
const fencedCodePattern = /^ {0,3}(`{3,}|~{3,})/u;
const thematicBreakPattern =
  /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u;
const tableDelimiterPattern =
  /^ {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u;
const standaloneImagePattern = /^ {0,3}!\[[^\]]*\]\([^)]*\)\s*$/u;
const leadingH1Pattern =
  /^[\t ]{0,3}#(?!#)[\t ]+([^\n]+?)[\t ]*(?:\n[\t ]*\n|\n|$)/u;

function normalizedHeadingText(value: string) {
  return value
    .replace(/[\t ]+#+[\t ]*$/u, '')
    .replaceAll(/[*_`~=]/gu, '')
    .replaceAll(/\s+/gu, '')
    .trim();
}

export function omitDuplicateLeadingReviewHeading(
  markdown: string,
  displayedTitles: readonly string[],
) {
  const normalizedMarkdown = markdown.replaceAll('\r\n', '\n');
  const match = leadingH1Pattern.exec(normalizedMarkdown);
  if (!match) return normalizedMarkdown;
  const heading = normalizedHeadingText(match[1] ?? '');
  const duplicatesDisplayedTitle = displayedTitles.some(
    (title) => normalizedHeadingText(title) === heading,
  );
  return duplicatesDisplayedTitle
    ? normalizedMarkdown.slice(match[0].length).trimStart()
    : normalizedMarkdown;
}

function isSetextUnderline(line: string) {
  return /^ {0,3}(?:=+|-+)\s*$/u.test(line);
}

function listIndent(line: string) {
  return listItemPattern.exec(line)?.[1]?.length;
}

function isBlockStart(lines: readonly string[], index: number) {
  const line = lines[index] ?? '';
  return (
    atxHeadingPattern.test(line) ||
    fencedCodePattern.test(line) ||
    thematicBreakPattern.test(line) ||
    listItemPattern.test(line) ||
    /^ {0,3}>/u.test(line) ||
    standaloneImagePattern.test(line) ||
    (line.includes('|') && tableDelimiterPattern.test(lines[index + 1] ?? ''))
  );
}

function isSafelySplittableParagraph(markdown: string) {
  return (
    !markdown.includes('\n') &&
    !listItemPattern.test(markdown) &&
    !/(?:^#{1,6}\s|[*_`~]|==|!\[|\[[^\]]+\]\(|>|\|)/u.test(markdown)
  );
}

function markdownChunks(markdown: string) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const chunks: MarkdownChunk[] = [];
  let index = 0;
  let activeListGroupKey: string | undefined;
  let activeListIndent: number | undefined;
  let listGroupIndex = 0;

  const pushLines = (
    start: number,
    end: number,
    groupKey?: string,
    keepWithNext?: boolean,
  ) => {
    const chunk = lines.slice(start, end).join('\n').trim();
    if (chunk) {
      chunks.push({
        ...(groupKey === undefined ? {} : { groupKey }),
        ...(keepWithNext === undefined ? {} : { keepWithNext }),
        markdown: chunk,
      });
    }
  };

  while (index < lines.length) {
    if (!(lines[index] ?? '').trim()) {
      index += 1;
      continue;
    }

    const start = index;
    const currentListIndent = listIndent(lines[index] ?? '');
    if (currentListIndent === undefined) {
      activeListGroupKey = undefined;
      activeListIndent = undefined;
    }
    const fence = fencedCodePattern.exec(lines[index] ?? '')?.[1];
    if (fence) {
      const fenceCharacter = fence.slice(0, 1);
      index += 1;
      while (
        index < lines.length &&
        !new RegExp(
          `^ {0,3}${fenceCharacter}{${String(fence.length)},}`,
          'u',
        ).test(lines[index] ?? '')
      ) {
        index += 1;
      }
      index = Math.min(lines.length, index + 1);
      pushLines(start, index);
      continue;
    }

    if (atxHeadingPattern.test(lines[index] ?? '')) {
      index += 1;
      pushLines(start, index, undefined, true);
      continue;
    }

    if (index + 1 < lines.length && isSetextUnderline(lines[index + 1] ?? '')) {
      index += 2;
      pushLines(start, index, undefined, true);
      continue;
    }

    if (currentListIndent !== undefined) {
      if (
        activeListGroupKey === undefined ||
        activeListIndent !== currentListIndent
      ) {
        activeListGroupKey = `list-${String(listGroupIndex)}`;
        activeListIndent = currentListIndent;
        listGroupIndex += 1;
      }
      index += 1;
      while (index < lines.length) {
        const line = lines[index] ?? '';
        const nextListIndent = listIndent(line);
        if (nextListIndent === currentListIndent) break;
        if (!line.trim()) {
          const nextLine = lines[index + 1] ?? '';
          const followingListIndent = listIndent(nextLine);
          if (!nextLine.trim() || followingListIndent === currentListIndent) {
            break;
          }
          index += 1;
          continue;
        }
        if (/^\S/u.test(line) && isBlockStart(lines, index)) break;
        index += 1;
      }
      pushLines(start, index, activeListGroupKey);
      continue;
    }

    if (/^ {0,3}>/u.test(lines[index] ?? '')) {
      index += 1;
      while (
        index < lines.length &&
        (/^ {0,3}>/u.test(lines[index] ?? '') ||
          (!(lines[index] ?? '').trim() &&
            /^ {0,3}>/u.test(lines[index + 1] ?? '')))
      ) {
        index += 1;
      }
      pushLines(start, index);
      continue;
    }

    if (
      (lines[index] ?? '').includes('|') &&
      tableDelimiterPattern.test(lines[index + 1] ?? '')
    ) {
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        index += 1;
      }
      pushLines(start, index);
      continue;
    }

    if (
      thematicBreakPattern.test(lines[index] ?? '') ||
      standaloneImagePattern.test(lines[index] ?? '')
    ) {
      index += 1;
      pushLines(start, index);
      continue;
    }

    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !isBlockStart(lines, index) &&
      !isSetextUnderline(lines[index] ?? '')
    ) {
      index += 1;
    }
    pushLines(start, index);
  }

  return chunks;
}

export function splitReviewCardMarkdown(
  markdown: string,
): readonly ReviewCardMarkdownPaginationBlock[] {
  return markdownChunks(markdown).map((chunk) => ({
    ...(chunk.groupKey === undefined ? {} : { groupKey: chunk.groupKey }),
    ...(chunk.keepWithNext === undefined
      ? {}
      : { keepWithNext: chunk.keepWithNext }),
    markdown: chunk.markdown,
    splittable: isSafelySplittableParagraph(chunk.markdown),
  }));
}
