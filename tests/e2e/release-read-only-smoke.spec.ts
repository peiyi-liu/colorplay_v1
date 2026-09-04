import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { installReadOnlyGuard } from '../../scripts/release/read-only-smoke.mjs';

let server: Server;
let origin = '';
const observedMethods: string[] = [];

test.beforeAll(async () => {
  server = createServer((request, response) => {
    observedMethods.push(request.method ?? 'UNKNOWN');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.end();
      return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><body>
      <h1>PRESS START</h1>
      <form method="post" action="/mutate"><button type="submit">禁止寫入</button></form>
    </body></html>`);
  });
  await new Promise<void>((resolveReady) => {
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server failed');
  origin = `http://127.0.0.1:${String(address.port)}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolveClosed();
    });
  });
});

test('release smoke guard permits only read requests', async ({ page }) => {
  observedMethods.length = 0;
  const guard = await installReadOnlyGuard(page);
  await page.goto(origin);
  await expect(page.getByText('PRESS START', { exact: true })).toBeVisible();

  expect(guard.writeRequestCount).toBe(0);
  expect(
    observedMethods.every((method) => ['GET', 'HEAD'].includes(method)),
  ).toBe(true);
});

test('release smoke guard blocks a form write before it reaches the server', async ({
  page,
}) => {
  observedMethods.length = 0;
  const guard = await installReadOnlyGuard(page);
  await page.goto(origin);
  await page.getByRole('button', { name: '禁止寫入' }).click();

  await expect.poll(() => guard.writeRequestCount).toBe(1);
  expect(observedMethods).not.toContain('POST');
});
