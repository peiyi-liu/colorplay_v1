export const withoutNumberPrefix = (title: string) =>
  title.replace(
    /^\s*(?:第\s*)?\d+(?:\s*[-–—・.]\s*\d+)?(?:\s*章|節)?\s*[-–—・.]?\s*/u,
    '',
  );
