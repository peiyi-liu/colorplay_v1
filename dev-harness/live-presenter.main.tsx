import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LivePresenterHarness } from '../src/features/live/components/live-presenter.harness';
import {
  LIVE_PRESENTER_OPTION_LIMIT,
  LIVE_PRESENTER_PROMPT_LIMIT,
  LIVE_PRESENTER_HARNESS_SCENARIOS,
  type LivePresenterHarnessScenario,
} from '../src/features/live/components/live-presenter.test-fixtures';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const params = new URLSearchParams(window.location.search);
const requested = params.get('scenario');
const scenario: LivePresenterHarnessScenario = (
  LIVE_PRESENTER_HARNESS_SCENARIOS as readonly string[]
).includes(requested ?? '')
  ? (requested as LivePresenterHarnessScenario)
  : 'draft';
const positiveInteger = (name: string, fallback: number) => {
  const parsed = Number.parseInt(params.get(name) ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <LivePresenterHarness
      optionLength={positiveInteger(
        'optionLength',
        LIVE_PRESENTER_OPTION_LIMIT,
      )}
      pending={params.get('pending') === '1'}
      promptLength={positiveInteger(
        'promptLength',
        LIVE_PRESENTER_PROMPT_LIMIT,
      )}
      scenario={scenario}
    />
  </StrictMode>,
);
