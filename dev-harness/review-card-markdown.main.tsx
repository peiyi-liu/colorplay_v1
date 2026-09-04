import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ReviewCardMarkdownPreview } from '../src/features/learning/pages/review-card-markdown-preview';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';
import '../src/styles/review-card-markdown-preview.css';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');

createRoot(root).render(
  <StrictMode>
    <ReviewCardMarkdownPreview />
  </StrictMode>,
);
