import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { adminBrowserCatalogPlugin } from './scripts/vite/admin-browser-catalog';

const deploymentEnvironments = ['local', 'staging', 'production'] as const;

function deploymentEnvironment() {
  const value = process.env.COLORPLAY_DEPLOYMENT_ENVIRONMENT ?? 'local';
  if (
    !deploymentEnvironments.includes(
      value as (typeof deploymentEnvironments)[number],
    )
  ) {
    throw new Error('COLORPLAY_DEPLOYMENT_ENVIRONMENT_INVALID');
  }
  return value;
}

export default defineConfig(() => ({
  define: {
    __COLORPLAY_DEPLOYMENT_ENVIRONMENT__: JSON.stringify(
      deploymentEnvironment(),
    ),
  },
  plugins: [react(), tailwindcss(), adminBrowserCatalogPlugin()],
}));
