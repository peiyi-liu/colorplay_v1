import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ShopPageHarness } from '../src/features/inventory/pages/shop-page.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <ShopPageHarness />
  </StrictMode>,
);
