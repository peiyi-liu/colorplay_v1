import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  VISIBLE_UI_HARNESS_SCENARIOS,
  VisibleUiHarness,
  type VisibleUiHarnessScenario,
} from '../src/app/router/visible-ui.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const params = new URLSearchParams(window.location.search);
const requested = params.get('scenario');
const scenario: VisibleUiHarnessScenario = (
  VISIBLE_UI_HARNESS_SCENARIOS as readonly string[]
).includes(requested ?? '')
  ? (requested as VisibleUiHarnessScenario)
  : 'title';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <main id="main-content">
      <VisibleUiHarness scenario={scenario} />
    </main>
  </StrictMode>,
);
