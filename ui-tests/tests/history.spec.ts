import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test,
} from '@jupyterlab/galata';
import { cleanup, openNotebook } from './utils';

const NOTEBOOK_ID = '@jupyterlab/notebook-extension:tracker';
const SETTINGS_ID = 'jupyterlab-execute-time:settings';

async function timingWidget(page: IJupyterLabPageFixture, index: number) {
  return (await page.notebook.getCellLocator(index)).locator('.execute-time');
}

// Use fixed execution metadata so histories are distinct and assertions do not
// depend on kernel speed. Updates go through the real cell metadata signals.
async function recordExecution(
  page: IJupyterLabPageFixture,
  index: number,
  run: number,
  duration: number,
) {
  await page.evaluate(
    async ({ index, run, duration, pluginId }) => {
      const tracker = await window.galata.getPlugin(pluginId);
      const cell = tracker.currentWidget.content.model.cells.get(index);
      const start = Date.UTC(2025, 0, 1, 0, 0, run);
      cell.setMetadata('execution', {
        'iopub.execute_input': new Date(start).toISOString(),
        'shell.execute_reply.started': new Date(start).toISOString(),
        'shell.execute_reply': new Date(start + duration).toISOString(),
      });
    },
    { index, run, duration, pluginId: NOTEBOOK_ID },
  );
  await expect(await timingWidget(page, index)).toHaveAttribute(
    'data-prev-execution-time',
    `${duration}ms`,
  );
}

// Record more runs than the extension keeps for lookups by `execution` metadata.
async function recordManyExecutions(
  page: IJupyterLabPageFixture,
  index: number,
) {
  await page.evaluate(
    async ({ index, pluginId }) => {
      const tracker = await window.galata.getPlugin(pluginId);
      const cell = tracker.currentWidget.content.model.cells.get(index);
      for (let run = 0; run < 2500; run++) {
        const start = Date.UTC(2025, 0, 2, 0, 0, run);
        cell.setMetadata('execution', {
          'iopub.execute_input': new Date(start).toISOString(),
          'shell.execute_reply.started': new Date(start).toISOString(),
          'shell.execute_reply': new Date(start + 10).toISOString(),
        });
      }
    },
    { index, pluginId: NOTEBOOK_ID },
  );
}

async function rerender(page: IJupyterLabPageFixture) {
  await page.evaluate(async (pluginId) => {
    const settings = await window.galata.getPlugin(
      '@jupyterlab/apputils-extension:settings',
    );
    await settings.set(pluginId, 'showDate', false);
  }, SETTINGS_ID);
}

test.describe('Execution history', () => {
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

  test('Duplicated cells inherit independent histories', async ({ page }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    const previousRuns = await (
      await timingWidget(page, 1)
    ).getAttribute('title');
    expect(previousRuns).toContain('100ms');

    await page.notebook.selectCells(1);
    await page.evaluate(() =>
      window.jupyterapp.commands.execute('notebook:duplicate-below'),
    );
    await expect(await timingWidget(page, 2)).toHaveAttribute(
      'title',
      previousRuns!,
    );

    await recordExecution(page, 2, 3, 900);
    const duplicateRuns = await (
      await timingWidget(page, 2)
    ).getAttribute('title');
    expect(duplicateRuns).toContain('200ms');
    await rerender(page);
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      previousRuns!,
    );

    await recordExecution(page, 1, 4, 300);
    await expect(await timingWidget(page, 2)).toHaveAttribute(
      'title',
      duplicateRuns!,
    );
    await expect(await timingWidget(page, 1)).not.toHaveAttribute(
      'title',
      /900ms/,
    );
  });

  test('Reverting a notebook shows the runs before the restored run', async ({
    page,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    await page.notebook.save();
    await recordExecution(page, 1, 3, 300);

    await page.evaluate(async (pluginId) => {
      const tracker = await window.galata.getPlugin(pluginId);
      await tracker.currentWidget.context.revert();
    }, NOTEBOOK_ID);
    await expect(await timingWidget(page, 1)).toContainText('200ms');
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n100ms',
    );

    await recordExecution(page, 1, 4, 400);
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n200ms\n100ms',
    );
  });

  test('Reopening a notebook without saving shows the runs before the saved run', async ({
    page,
    tmpPath,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    await page.notebook.save();
    await recordExecution(page, 1, 3, 300);

    // Discard the changes on closing, without reverting the notebook first.
    await page.activity
      .getTabLocator('Simple_notebook.ipynb')
      .locator('.lm-TabBar-tabCloseIcon')
      .click();
    await page
      .locator('.jp-Dialog')
      .locator('button.jp-mod-accept.jp-mod-warn')
      .click();
    await page.notebook.openByPath(`${tmpPath}/Simple_notebook.ipynb`);
    await page.notebook.activate('Simple_notebook.ipynb');
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'data-prev-execution-time',
      '200ms',
    );
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n100ms',
    );
  });

  test('New executions stay latest when the clock moves backwards', async ({
    page,
  }) => {
    await page.evaluate(async (pluginId) => {
      const settings = await window.galata.getPlugin(
        '@jupyterlab/apputils-extension:settings',
      );
      await settings.set(pluginId, 'historyCount', 1);
    }, SETTINGS_ID);

    await recordExecution(page, 1, 3, 300);
    await recordExecution(page, 1, 2, 200);
    await recordExecution(page, 1, 1, 100);
    await rerender(page);

    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'data-prev-execution-time',
      '100ms',
    );
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n200ms',
    );
  });

  test('Unrelated metadata updates do not record a restored run again', async ({
    page,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await page.notebook.save();
    await recordExecution(page, 1, 2, 200);
    await recordExecution(page, 1, 3, 300);

    await page.evaluate(async (pluginId) => {
      const tracker = await window.galata.getPlugin(pluginId);
      await tracker.currentWidget.context.revert();
    }, NOTEBOOK_ID);
    await expect(await timingWidget(page, 1)).toContainText('100ms');
    // An unrelated metadata update must not turn the restored run into a new one.
    await page.evaluate(async (pluginId) => {
      const tracker = await window.galata.getPlugin(pluginId);
      tracker.currentWidget.content.model.cells
        .get(1)
        .setMetadata('tags', ['restored']);
    }, NOTEBOOK_ID);
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'data-prev-execution-time',
      '100ms',
    );
    await expect(await timingWidget(page, 1)).not.toHaveAttribute('title');

    await recordExecution(page, 1, 4, 400);
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n100ms',
    );
  });

  test('Notebook copies retain history when the source runs before opening', async ({
    page,
    tmpPath,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    const previousRuns = await (
      await timingWidget(page, 1)
    ).getAttribute('title');
    await page.notebook.save();
    const copy = await page.evaluate(async (tmpPath) => {
      const result = await window.jupyterapp.serviceManager.contents.copy(
        `${tmpPath}/Simple_notebook.ipynb`,
        tmpPath,
      );
      return { path: result.path, name: result.name };
    }, tmpPath);

    await recordExecution(page, 1, 3, 300);
    await page.notebook.openByPath(copy.path);
    await page.notebook.activate(copy.name);
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      previousRuns!,
    );

    await recordExecution(page, 1, 4, 400);
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n200ms\n100ms',
    );
    await page.notebook.activate('Simple_notebook.ipynb');
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'data-prev-execution-time',
      '300ms',
    );
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n200ms\n100ms',
    );
  });

  for (const sameExecution of [true, false]) {
    test(`Notebook copies keep independent histories (matching execution: ${sameExecution})`, async ({
      page,
      tmpPath,
    }) => {
      await recordExecution(page, 1, 1, 100);
      await recordExecution(page, 1, 2, 200);
      const previousRuns = await (
        await timingWidget(page, 1)
      ).getAttribute('title');
      expect(previousRuns).toContain('100ms');
      await page.notebook.save();

      const copy = await page.evaluate(
        async ({ tmpPath, sameExecution }) => {
          const contents = window.jupyterapp.serviceManager.contents;
          const copy = await contents.copy(
            `${tmpPath}/Simple_notebook.ipynb`,
            tmpPath,
          );
          if (!sameExecution) {
            // Same cell IDs alone must not import another notebook's history.
            const model = await contents.get(copy.path);
            model.content.cells[1].metadata.execution = {
              'iopub.execute_input': '2025-02-01T00:00:00.000Z',
              'shell.execute_reply.started': '2025-02-01T00:00:00.000Z',
              'shell.execute_reply': '2025-02-01T00:00:00.500Z',
            };
            await contents.save(copy.path, model);
          }
          return { path: copy.path, name: copy.name };
        },
        { tmpPath, sameExecution },
      );
      await page.notebook.openByPath(copy.path);
      await page.notebook.activate(copy.name);
      if (sameExecution) {
        await expect(await timingWidget(page, 1)).toHaveAttribute(
          'title',
          previousRuns!,
        );
      } else {
        await expect(await timingWidget(page, 1)).toHaveAttribute(
          'data-prev-execution-time',
          '500ms',
        );
        await expect(await timingWidget(page, 1)).not.toHaveAttribute('title');
      }

      await recordExecution(page, 1, 3, 900);
      const copyRuns = await (
        await timingWidget(page, 1)
      ).getAttribute('title');
      await rerender(page);
      await page.notebook.activate('Simple_notebook.ipynb');
      await expect(await timingWidget(page, 1)).toHaveAttribute(
        'title',
        previousRuns!,
      );
      await recordExecution(page, 1, 4, 300);
      await page.notebook.activate(copy.name);
      await expect(await timingWidget(page, 1)).toHaveAttribute(
        'title',
        copyRuns!,
      );
    });
  }

  test('Two views share history after one view closes', async ({ page }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    const previousRuns = await (
      await timingWidget(page, 1)
    ).getAttribute('title');
    await page.evaluate(() =>
      window.jupyterapp.commands.execute('docmanager:clone'),
    );
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      previousRuns!,
    );
    await recordExecution(page, 1, 3, 300);
    const sharedRuns = await (
      await timingWidget(page, 1)
    ).getAttribute('title');
    await page.notebook.close(false);
    await page.notebook.activate('Simple_notebook.ipynb');
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      sharedRuns!,
    );
    await recordExecution(page, 1, 4, 400);
    await expect(await timingWidget(page, 1)).toHaveAttribute('title', /300ms/);
  });

  test('History survives renaming and reopening a notebook', async ({
    page,
    tmpPath,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    const previousRuns = await (
      await timingWidget(page, 1)
    ).getAttribute('title');
    await page.notebook.save();
    await page.evaluate(async (pluginId) => {
      const tracker = await window.galata.getPlugin(pluginId);
      await tracker.currentWidget.context.rename('Renamed.ipynb');
    }, NOTEBOOK_ID);
    await page.notebook.close(false);
    await page.notebook.openByPath(`${tmpPath}/Renamed.ipynb`);
    await page.notebook.activate('Renamed.ipynb');
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      previousRuns!,
    );
  });

  test('Moved cells keep their history after many runs of other cells', async ({
    page,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    await recordManyExecutions(page, 2);
    await page.notebook.selectCells(1);
    await page.evaluate(() =>
      window.jupyterapp.commands.execute('notebook:move-cell-up'),
    );
    await expect(await timingWidget(page, 0)).toHaveAttribute(
      'title',
      'Previous Runs:\n100ms',
    );
  });

  test('Closed notebooks keep their history after many runs of other cells', async ({
    page,
    tmpPath,
  }) => {
    await recordExecution(page, 1, 1, 100);
    await recordExecution(page, 1, 2, 200);
    await page.notebook.save();
    await page.notebook.close(false);
    await page.notebook.createNew('Other.ipynb');
    await recordManyExecutions(page, 0);
    await page.notebook.openByPath(`${tmpPath}/Simple_notebook.ipynb`);
    await page.notebook.activate('Simple_notebook.ipynb');
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'data-prev-execution-time',
      '200ms',
    );
    await expect(await timingWidget(page, 1)).toHaveAttribute(
      'title',
      'Previous Runs:\n100ms',
    );
  });
});
