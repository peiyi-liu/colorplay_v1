import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FoundationRoot } from './app/foundation-root';

const root = document.getElementById('root');
if (!root) throw new Error('APP_ROOT_MISSING');
createRoot(root).render(
  <StrictMode>
    <FoundationRoot />
  </StrictMode>,
);
