import { expect, galata, test } from '@jupyterlab/galata';
import { openNotebook, cleanup, watchTimeIncrease } from './utils';

const NOTEBOOK_ID = '@jupyterlab/notebook-extension:tracker';

test.describe('Cell operations', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [NOTEBOOK_ID]: {
        ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
        windowingMode: 'defer',
      },
    },
  });
  test.beforeEach(openNotebook('Simple_notebook.ipynb'));
  test.afterEach(cleanup);

  test('Add and move a cell', async ({ page }) => {
    await page.notebook.run();
    // There are three cells, there should be three widgets
    expect(await page.locator('.execute-time').count()).toBe(3);
    // Add a new cell
    await page.notebook.addCell('code', 'sleep(0.01)');
    // Move the added cell up (fourth, index three)
    await page.notebook.selectCells(3);
    await page.menu.clickMenuItem('Edit>Move Cell Up');
    // Run the added cell
    await page.notebook.runCell(2, true);
    // Four cells should now have the widget
    expect(await page.locator('.execute-time').count()).toBe(4);
  });

  test('Re-run a cell that is already running', async ({ page }) => {
    // Run `from time import sleep`
    await page.notebook.runCell(0, true);

    // Define locators
    const cellLocator = page.locator('.jp-Cell[data-windowed-list-index="1"]');
    const widgetLocator = cellLocator.locator('.execute-time');

    // Increase the sleep interval to eight seconds to catch it in flight
    await page.notebook.setCell(1, 'code', 'sleep(8)');

    // Execute the cell, but do not wait for it to finish
    const firstRunPromise = page.notebook.runCell(1, true);

    // Wait for the widget to show up
    await widgetLocator.waitFor();

    // Execute the cell again
    const secondRunPromise = page.notebook.runCell(1, true);

    // Expect the widget to be gone
    await expect(widgetLocator).toBeHidden();

    // Wait for the widget to show up again (after the first cell finishes)
    await widgetLocator.waitFor();

    // Expect at least 50 updates, and every subsequent update to be monotonically increasing
    const wasMonotonicallyIncreasing = await watchTimeIncrease(cellLocator, {
      minimumTicks: 50,
      timeout: 10 * 1000,
    });
    expect(wasMonotonicallyIncreasing).toBe(true);

    // Wait for the execution to finish before closing the test for clean teardown.
    await Promise.all([firstRunPromise, secondRunPromise]);
  });
});
