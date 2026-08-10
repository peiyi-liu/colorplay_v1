import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import {
  CHAPTER_DETAIL_HARNESS_SCENARIOS,
  ChapterDetailPageHarness,
  type ChapterDetailHarnessScenario,
} from '../src/features/learning/pages/chapter-detail-page.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const requested = new URLSearchParams(window.location.search).get('scenario');
const scenario: ChapterDetailHarnessScenario = (
  CHAPTER_DETAIL_HARNESS_SCENARIOS as readonly string[]
).includes(requested ?? '')
  ? (requested as ChapterDetailHarnessScenario)
  : 'in-progress';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <MemoryRouter>
      <main id="main-content">
        <ChapterDetailPageHarness scenario={scenario} />
      </main>
    </MemoryRouter>
  </StrictMode>,
);
