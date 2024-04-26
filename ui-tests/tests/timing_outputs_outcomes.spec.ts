import { expect, galata, test } from '@jupyterlab/galata';
import { openNotebook, cleanup, maskedScreenshot } from './utils';

const SETTINGS_ID = 'jupyterlab-execute-time:settings';

test.describe('Timing outcomes with ', () => {
  test.beforeEach(openNotebook('Timing_outputs_outcomes.ipynb'));
  test.afterEach(cleanup);
  // Disable flashing highlight for screenshot consistency
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [SETTINGS_ID]: {
        ...galata.DEFAULT_SETTINGS[SETTINGS_ID],
        highlight: false,
        showOutputsPerSecond: true,
      },
    },
  });

  test('"Last executed at" state', async ({ page }) => {
    const cell = await page.notebook.getCell(2);

    // Execute cell and wait for it to complete
    await page.notebook.runCell(4);

    const widget = await cell.waitForSelector('.execute-time');
    expect(await widget.textContent()).toContain('Last executed at');
    expect(await widget.textContent()).toContain('outputs at');
    expect(await maskedScreenshot(widget)).toMatchSnapshot(
      'last-executed-outputs.png'
    );
  });
});
