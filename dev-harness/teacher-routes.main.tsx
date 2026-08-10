import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  TEACHER_ROUTES_HARNESS_SCENARIOS,
  TeacherRoutesHarness,
  type TeacherRoutesHarnessScenario,
} from '../src/features/teacher-content/pages/teacher-routes.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const params = new URLSearchParams(window.location.search);
const requested = params.get('scenario');
const scenario: TeacherRoutesHarnessScenario = (
  TEACHER_ROUTES_HARNESS_SCENARIOS as readonly string[]
).includes(requested ?? '')
  ? (requested as TeacherRoutesHarnessScenario)
  : 'dashboard';
const hudInitialRoute = params.get('route') ?? '/teacher';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <main id="main-content">
      <TeacherRoutesHarness
        hudInitialRoute={hudInitialRoute}
        scenario={scenario}
      />
    </main>
  </StrictMode>,
);
