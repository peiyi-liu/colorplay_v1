import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { StudentHudHarness } from '../src/app/shell/student-hud.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <StudentHudHarness />
  </StrictMode>,
);
