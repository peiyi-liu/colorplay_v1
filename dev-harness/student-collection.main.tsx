import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { StudentCollectionPagesHarness } from '../src/app/shell/student-collection-pages.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <StudentCollectionPagesHarness />
  </StrictMode>,
);
