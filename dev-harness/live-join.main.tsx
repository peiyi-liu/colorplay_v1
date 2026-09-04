import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LiveJoinPageHarness } from '../src/features/live/pages/live-join-page.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <LiveJoinPageHarness />
  </StrictMode>,
);
