import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  QuizSessionHarness,
  type QuizSessionHarnessScenario,
} from '../src/features/quiz/pages/quiz-session.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const requested = new URLSearchParams(window.location.search).get('scenario');
const scenario: QuizSessionHarnessScenario =
  requested === 'correct' ? 'correct' : 'idle';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <QuizSessionHarness scenario={scenario} />
  </StrictMode>,
);
