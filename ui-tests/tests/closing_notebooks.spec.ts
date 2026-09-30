import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import { openNotebook, cleanup } from './utils';

const SETTINGS_ID = 'jupyterlab-execute-time:settings';

/**
 * Record the errors which the page logs or throws from now on.
 */
function recordErrors(page: IJupyterLabPageFixture): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

test.describe('Closing notebooks', () => {
  test.beforeEach(openNotebook('Simple_notebook.ipynb'));
  test.afterEach(cleanup);

  test('Change a setting after closing a notebook', async ({ page }) => {
    await page.notebook.close(false);
    await expect(page.locator('.jp-NotebookPanel')).toHaveCount(0);
    const errors = recordErrors(page);

    await page.evaluate(async (pluginId) => {
      const settingRegistry = await window.galata.getPlugin(
        '@jupyterlab/apputils-extension:settings',
      );
      await settingRegistry.set(pluginId, 'highlight', false);
    }, SETTINGS_ID);
    // Give console messages time to reach the test runner
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test('Close a notebook while a cell runs', async ({ page }) => {
    await page.notebook.runCell(0);
    await page.notebook.setCell(1, 'code', 'sleep(5)');
    await page.notebook.runCell(1, { wait: false });
    const cell = await page.notebook.getCellLocator(1);
    await expect(cell.locator('.execute-time')).toContainText(
      'Execution started at',
    );
    const errors = recordErrors(page);

    await page.notebook.close(false);
    await expect(page.locator('.jp-NotebookPanel')).toHaveCount(0);
    // The live timer ticks every 100 ms
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });

  test('Close one of two views of a notebook', async ({ page }) => {
    await page.evaluate(async () => {
      const app = window.jupyterapp;
      const original = app.shell.currentWidget;
      await app.commands.execute('docmanager:clone');
      const view = Array.from(app.shell.widgets('main')).find(
        (widget) =>
          widget !== original && widget.title.label === original.title.label,
      );
      view.close();
      while (!view.isDisposed) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      app.shell.activateById(original.id);
    });
    const errors = recordErrors(page);

    await page.notebook.runCell(0);
    // Give console messages time to reach the test runner
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
    const cell = await page.notebook.getCellLocator(0);
    await expect(cell.locator('.execute-time')).toContainText(
      'Last executed at',
    );
  });
});
