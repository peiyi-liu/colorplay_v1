import type { ExpectedBrowserFailureDeclaration } from './browser-health';

export const teacherContentExpectedFailureDeclarations = {
  // owner 0730（67aa762）：內容工作區與匯入精靈已退役，404 contract
  // 不應觸發任何預期內 4xx API 請求。
} as const satisfies Readonly<
  Record<string, ExpectedBrowserFailureDeclaration>
>;
