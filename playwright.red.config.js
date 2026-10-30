import base from './playwright.config.js';

export default {
  ...base,
  outputDir: './test-results/playwright-red-03',
  reporter: [['list']],
  use: {
    ...base.use,
    baseURL: 'http://127.0.0.1:4174'
  },
  webServer: {
    ...base.webServer,
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174/test/fixtures/health.html',
    reuseExistingServer: false
  }
};
