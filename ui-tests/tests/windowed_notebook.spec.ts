import { expect, galata, test } from '@jupyterlab/galata';
import { openNotebook, acceptDialog, cleanup } from './utils';

const SETTINGS_ID = 'jupyterlab-execute-time:settings';
const NOTEBOOK_ID = '@jupyterlab/notebook-extension:tracker';

test.describe('Windowed notebook', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [NOTEBOOK_ID]: {
        ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
        windowingMode: 'full',
      },
    },
  });
  test.beforeEach(openNotebook('100_code_cells.ipynb'));
  test.afterEach(cleanup);

  test('Node attaches after scrolling into view', async ({ page }) => {
    await page.notebook.run();
    // Check that only a fraction of cells have the widget
    expect(await page.locator('.execute-time').count()).toBeLessThan(50);
    // Get the 100th cells locator without scrolling
    const lastCellLocator = page.locator('.jp-Cell:last-child');
    expect(await lastCellLocator.isHidden()).toBeTruthy();
    const widgetLocator = lastCellLocator.locator('.execute-time');
    expect(await widgetLocator.isHidden()).toBeTruthy();
    // Scroll to the 100th cell
    await page.notebook.getCell(100);
    // The widget should not be shown
    expect(await widgetLocator.isHidden()).toBeFalsy();
    // The widget should be in "executed" state
    expect(await widgetLocator.textContent()).toContain('Last executed at');
  });
});

test.describe('Windowed notebook/hover', () => {
  // The hover mode is useful for creating windowed notebook tests
  // because in this mode execution does not move the notebook window.
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [NOTEBOOK_ID]: {
        ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
        windowingMode: 'full',
      },
      [SETTINGS_ID]: {
        ...galata.DEFAULT_SETTINGS[SETTINGS_ID],
        positioning: 'hover',
      },
    },
  });
  test.beforeEach(openNotebook('100_code_cells.ipynb'));
  test.afterEach(cleanup);

  test('Only one node per cell is attached when scrolling', async ({
    page,
  }) => {
    // Adjust timing to make the execution take 20 seconds total
    await page.notebook.setCell(
      1,
      'code',
      'from time import sleep\ndef f(i):\n    sleep(0.2)'
    );
    // Run cells
    await page.evaluate(async () => {
      await window.jupyterapp.commands.execute('notebook:run-all-cells');
    });
    // Count the visible cells
    const visibleCells = await page.locator('.jp-CodeCell:visible').count();
    // Wait until all visible cells have the widget
    await page
      .locator(`:nth-match(.execute-time, ${visibleCells})`)
      .waitFor({ state: 'hidden' });
    // Restart kernel and rerun cells
    await page.evaluate(async () => {
      window.jupyterapp.commands.execute('notebook:restart-run-all');
    });
    await acceptDialog(page, 'Restart Kernel?');
    // Scroll up and down
    for (let i = 0; i < 3; i++) {
      // Scroll to the 100th cell
      await page.notebook.getCell(100);
      // Scroll to the 1st cell
      await page.notebook.getCell(1);
    }
    // The number of visible widgets should be approximately equal the number of visible cells
    // If multiple nodes were attached, the count would be equal to `3 * visibleCells`.
    expect(await page.locator(`.execute-time`).count()).toBeLessThanOrEqual(
      visibleCells + 2
    );
  });
});
