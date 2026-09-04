import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  QuizResultHarness,
  type QuizResultHarnessKind,
} from '../src/features/quiz/pages/quiz-result.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const requested = new URLSearchParams(window.location.search).get('kind');
const kind: QuizResultHarnessKind =
  requested === 'chapter' ? 'chapter' : 'section';
const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');

createRoot(root).render(
  <StrictMode>
    <QuizResultHarness kind={kind} />
  </StrictMode>,
);
