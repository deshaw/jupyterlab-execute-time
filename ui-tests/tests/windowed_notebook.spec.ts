import { expect, galata, test } from '@jupyterlab/galata';
import { openNotebook, acceptDialog, cleanup } from './utils';

const SETTINGS_ID = 'jupyterlab-execute-time:settings';
const NOTEBOOK_ID = '@jupyterlab/notebook-extension:tracker';

test.describe('Windowed notebook', () => {
  const fileName = '100_code_cells.ipynb';
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [NOTEBOOK_ID]: {
        ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
        windowingMode: 'full',
      },
    },
  });
  test.describe.configure({ retries: 4 });
  test.beforeEach(openNotebook(fileName));
  test.afterEach(cleanup);

  test('Node attaches after scrolling into view', async ({ page, tmpPath }) => {
    // Run all cells; this will scroll us to the end
    await page.notebook.run();
    // Select first cell
    await page.notebook.selectCells(0);
    await page.notebook.save();
    // Reopen the notebook to unload the widgets attached during execution
    await page.notebook.close(false);
    await page.notebook.openByPath(`${tmpPath}/${fileName}`);
    await page.notebook.activate(fileName);
    // Wait for the notebook state to settle
    await page.waitForTimeout(100);
    // Check that only a fraction of cells have the widget
    expect(await page.locator('.execute-time').count()).toBeLessThan(50);
    // Get the 100th cells locator without scrolling
    const lastCellLocator = page.locator('.jp-Cell:last-child');
    expect(await lastCellLocator.isHidden()).toBeTruthy();
    const widgetLocator = lastCellLocator.locator('.execute-time');
    expect(await widgetLocator.isHidden()).toBeTruthy();
    // Scroll to the 100th cell
    await page.notebook.getCell(100);
    // The widget should be shown
    expect(await widgetLocator.isHidden()).toBeFalsy();
    // The widget should be in "executed" state
    expect(await widgetLocator.textContent()).toContain('Last executed at');
  });
});

test.describe('Windowed notebook/hover', () => {
  const fileName = '100_code_cells.ipynb';
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

  test.beforeEach(openNotebook(fileName));
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
    expect(visibleCells).toBeGreaterThan(0);
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
      visibleCells + 5
    );
  });
});
