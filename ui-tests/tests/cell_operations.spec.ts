import { expect, galata, test } from '@jupyterlab/galata';
import { openNotebook, cleanup } from './utils';

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
});
