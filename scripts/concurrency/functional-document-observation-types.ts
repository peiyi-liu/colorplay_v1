import type { Page, Request } from '@playwright/test';
export type RouteKind =
  'LIVE_PRESENTER' | 'LIVE_SESSION' | 'LIVE_REPORT' | 'CLASSROOM' | 'OTHER';
export type Stage =
  'MATCHED' | 'FETCH' | 'PARSE' | 'HOOK' | 'FULFILL' | 'DISPOSE' | 'ABORT';
export interface Intent {
  ordinal: number;
  route: RouteKind;
  state: 'BEGIN' | 'RETURNED' | 'FAILED';
  atNodeMs: number;
}
export interface Value {
  ordinal: number;
  actor: 'T1' | 'S1' | 'S2';
  pageOrdinal: number;
  generation: number;
  route: RouteKind;
  collection: 'OBSERVED' | 'UNKNOWN';
  intent: Intent | null;
  routeMatched: boolean;
  routeClosed: boolean;
  continue: 'NOT_CALLED';
  fallback: 'NOT_CALLED';
  stages: {
    stage: Stage;
    state: 'BEGIN' | 'RETURNED' | 'FAILED';
    atNodeMs: number;
  }[];
  branch:
    | 'UNOBSERVED'
    | 'ORIGIN_BLOCK'
    | 'POLICY_DROP'
    | 'REDIRECT_BLOCK'
    | 'CATCH_ABORT';
  routeError: {
    stage: Stage | 'CATCH';
    errorClass: 'PLAYWRIGHT_TIMEOUT' | 'ERROR' | 'OTHER';
  } | null;
  status: number | null;
  terminal: 'UNOBSERVED' | 'FINISHED' | 'FAILED';
  failureCode: string;
  blockedReason: string;
  corsReason: string;
  canceled: boolean | null;
  redirect: boolean;
  frameIdPresent: boolean | null;
  frameMatched: boolean | null;
  loaderConsistent: boolean | null;
  loaderIdPresent: boolean | null;
  requestAtNodeMs: number | null;
  responseAtNodeMs: number | null;
  terminalAtNodeMs: number | null;
}
export interface Row {
  url: string;
  cdp?: string;
  frame?: string | undefined;
  loader?: string | undefined;
  request?: Request;
  value: Value;
}
export interface Owner {
  page: Page;
  actor: Value['actor'];
  index: number;
  origin: string;
  session: string | null;
  classroom: string | null;
  generation: number;
  intent: Intent | null;
  rows: Row[];
  ids: Map<string, Row>;
  requests: WeakMap<Request, Row>;
  closed: boolean;
  unavailable: boolean;
}

export interface FramePin {
  id: string;
  loader: string | null;
  url: string | null;
}
