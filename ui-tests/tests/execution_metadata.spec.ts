import type { CodeCell } from '@jupyterlab/cells';
import type { NotebookPanel } from '@jupyterlab/notebook';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import { expect, galata, test } from '@jupyterlab/galata';
import * as path from 'path';
import { cleanup } from './utils';

const SETTINGS_ID = 'jupyterlab-execute-time:settings';
const NOTEBOOK_ID = '@jupyterlab/notebook-extension:tracker';
const START = '2026-09-29T12:00:00.000Z';
const END = '2026-09-29T12:00:01.000Z';

async function openNotebook(page: IJupyterLabPageFixture, path: string) {
  await page.evaluate(async (path) => {
    const panel = (await window.jupyterapp.commands.execute('docmanager:open', {
      path,
    })) as NotebookPanel;
    await panel.context.ready;
  }, path);
}

async function openSimpleNotebook(
  page: IJupyterLabPageFixture,
  tmpPath: string,
) {
  await page.contents.uploadFile(
    path.resolve(__dirname, '../notebooks/Simple_notebook.ipynb'),
    `${tmpPath}/Simple_notebook.ipynb`,
  );
  await openNotebook(page, `${tmpPath}/Simple_notebook.ipynb`);
}

async function saveAndReopen(page: IJupyterLabPageFixture) {
  const path = await page.evaluate(async () => {
    const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
    const path = panel.context.path;
    await panel.context.save();
    await window.jupyterapp.commands.execute('application:close');
    return path;
  });
  await expect(page.locator('.jp-NotebookPanel')).toHaveCount(0);
  await openNotebook(page, path);
}

for (const showLiveExecutionTime of [true, false]) {
  test.describe(`Execution metadata (live=${showLiveExecutionTime})`, () => {
    test.use({
      mockSettings: {
        ...galata.DEFAULT_SETTINGS,
        [SETTINGS_ID]: { showLiveExecutionTime },
        [NOTEBOOK_ID]: {
          ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
          windowingMode: 'none',
        },
      },
    });
    test.afterEach(cleanup);

    for (const busy of [false, true]) {
      for (const idle of [false, true]) {
        test(`Idle cells with incomplete timing (busy=${busy}, idle=${idle})`, async ({
          page,
          tmpPath,
        }) => {
          const statusMetadata = {
            ...(busy ? { 'iopub.status.busy': START } : {}),
            ...(idle ? { 'iopub.status.idle': END } : {}),
          };
          const executions = [
            { ...statusMetadata, 'shell.execute_reply.started': START },
            { ...statusMetadata, 'iopub.execute_input': START },
            {
              ...statusMetadata,
              'iopub.execute_input': START,
              'shell.execute_reply.started': START,
              'shell.execute_reply': END,
            },
            {
              ...statusMetadata,
              'iopub.execute_input': START,
              execution_failed: END,
            },
            {
              ...statusMetadata,
              'shell.execute_reply.started': START,
              'iopub.execute_input': START,
            },
          ];
          const fileName = 'Execution_metadata.ipynb';
          await page.contents.uploadContent(
            JSON.stringify({
              nbformat: 4,
              nbformat_minor: 5,
              metadata: {
                kernelspec: {
                  display_name: 'Python 3 (ipykernel)',
                  language: 'python',
                  name: 'python3',
                },
              },
              cells: executions.map((execution, index) => ({
                id: `cell-${index}`,
                cell_type: 'code',
                execution_count: null,
                metadata: { execution },
                outputs: [],
                source: '1 + 1',
              })),
            }),
            'text',
            `${tmpPath}/${fileName}`,
          );
          await openNotebook(page, `${tmpPath}/${fileName}`);

          // Completed and failed timings must still render on idle cells.
          const cells = page.locator('.jp-CodeCell');
          await expect(cells.nth(2).locator('.execute-time')).toContainText(
            'Last executed',
          );
          await expect(cells.nth(3).locator('.execute-time')).toContainText(
            'Failed',
          );
          // Neither start-time field should start a timer on an idle cell.
          await expect(cells.nth(0).locator('.execute-time')).toHaveCount(0);
          await expect(cells.nth(1).locator('.execute-time')).toHaveCount(0);
          await expect(cells.nth(4).locator('.execute-time')).toHaveCount(0);
          // Rendering must not alter the saved execution metadata.
          expect(
            await page.evaluate(() => {
              const panel = window.jupyterapp.shell
                .currentWidget as NotebookPanel;
              return panel.content.widgets.map((cell) =>
                cell.model.getMetadata('execution'),
              );
            }),
          ).toEqual(executions);
        });
      }
    }

    test('An existing timer stops when the cell becomes idle and can run again', async ({
      page,
      tmpPath,
    }) => {
      await openSimpleNotebook(page, tmpPath);
      const cell = page.locator('.jp-CodeCell').first();
      const widget = cell.locator('.execute-time');

      await page.evaluate(() => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        const model = (panel.content.widgets[0] as CodeCell).model;
        model.executionState = 'running';
        model.setMetadata('execution', {
          'shell.execute_reply.started': new Date().toISOString(),
        });
      });
      await expect(widget).toContainText('Execution started at');
      if (showLiveExecutionTime) {
        await expect(widget.locator('span').nth(1)).not.toBeEmpty();
      }

      // A state change alone must stop the live timer, even without a reply.
      await page.evaluate(() => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        (panel.content.widgets[0] as CodeCell).model.executionState = 'idle';
      });
      await expect(widget).toHaveCount(0);

      await page.evaluate(() => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        const model = (panel.content.widgets[0] as CodeCell).model;
        model.executionState = 'running';
        model.setMetadata('execution', {
          'iopub.execute_input': new Date().toISOString(),
        });
      });
      await expect(widget).toContainText('Execution started at');

      await page.evaluate(() => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        const model = (panel.content.widgets[0] as CodeCell).model;
        model.executionState = 'idle';
        model.setMetadata('execution', {
          ...model.getMetadata('execution'),
          'shell.execute_reply': new Date().toISOString(),
        });
      });
      await expect(widget).toContainText('Last executed');
      await expect(widget.locator('span').nth(1)).toBeEmpty();
      const previousTime = await widget.getAttribute(
        'data-prev-execution-time',
      );

      // Real executions must still show live timing and finish normally.
      const execution = page.evaluate(async () => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        panel.content.activeCellIndex = 0;
        panel.content.widgets[0].model.sharedModel.setSource(
          'import time\ntime.sleep(1)',
        );
        await panel.sessionContext.ready;
        await window.jupyterapp.commands.execute('notebook:run-cell');
      });
      await expect(widget).toContainText('Execution started at');
      if (showLiveExecutionTime) {
        await expect(widget.locator('span').nth(1)).not.toBeEmpty();
      }
      await execution;
      await expect(widget).toContainText('Last executed');
      expect((await widget.getAttribute('title')).split('\n')[1]).toBe(
        previousTime,
      );
    });

    test('All execution timestamp combinations stay non-running on idle cells', async ({
      page,
      tmpPath,
    }) => {
      await openSimpleNotebook(page, tmpPath);
      await page.evaluate(
        ({ start, end }) => {
          const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
          const keys = [
            'iopub.execute_input',
            'shell.execute_reply.started',
            'iopub.status.busy',
            'iopub.status.idle',
            'shell.execute_reply',
            'execution_failed',
          ];
          panel.model.sharedModel.insertCells(
            0,
            Array.from({ length: 2 ** keys.length }, (_, mask) => ({
              cell_type: 'code' as const,
              source: '1 + 1',
              outputs: [],
              execution_count: null,
              metadata: {
                execution: Object.fromEntries(
                  keys
                    .filter((_, index) => mask & (1 << index))
                    .map((key) => [
                      key,
                      key.endsWith('started') ||
                      key === 'iopub.execute_input' ||
                      key === 'iopub.status.busy'
                        ? start
                        : end,
                    ]),
                ),
              },
            })),
          );
        },
        { start: START, end: END },
      );
      const cells = page.locator('.jp-CodeCell');
      await expect(cells).toHaveCount(67);
      await expect(cells.nth(63).locator('.execute-time')).toContainText(
        'Failed',
      );
      await expect(page.locator('.execute-time')).not.toContainText([
        'Execution started at',
      ]);
    });

    test('Empty completion timestamps do not start timers on idle cells', async ({
      page,
      tmpPath,
    }) => {
      await openSimpleNotebook(page, tmpPath);
      const executions: Record<string, string | null>[] = [
        ...['iopub.execute_input', 'shell.execute_reply.started'].flatMap(
          (startKey) =>
            [null, ''].flatMap((end) => [
              { [startKey]: START, 'shell.execute_reply': end },
              { [startKey]: START, execution_failed: end },
            ]),
        ),
        {
          'iopub.execute_input': START,
          'shell.execute_reply': null,
          execution_failed: END,
        },
        {
          'iopub.execute_input': START,
          'shell.execute_reply': END,
          execution_failed: null,
        },
        {
          'iopub.execute_input': START,
          'shell.execute_reply': '',
          execution_failed: END,
        },
      ];
      await page.evaluate((executions) => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        panel.model.sharedModel.insertCells(
          0,
          executions.map((execution) => ({
            cell_type: 'code' as const,
            source: '1 + 1',
            outputs: [],
            execution_count: null,
            metadata: { execution },
          })),
        );
      }, executions);
      const cells = page.locator('.jp-CodeCell');
      await expect(cells.nth(8).locator('.execute-time')).toContainText(
        'Failed',
      );
      await expect(cells.nth(9).locator('.execute-time')).toContainText(
        'Last executed',
      );
      await expect(cells.nth(10).locator('.execute-time')).toContainText(
        'Failed',
      );
      await expect(cells.nth(10).locator('.execute-time')).toContainText(
        '1.00s',
      );
      for (let index = 0; index < 8; index++) {
        await expect(cells.nth(index).locator('.execute-time')).toHaveCount(0);
      }
    });

    if (showLiveExecutionTime) {
      test('Rapid reruns and notebook closure release their live intervals', async ({
        page,
        tmpPath,
      }) => {
        await openSimpleNotebook(page, tmpPath);
        const timers = await page.evaluateHandle(() => {
          const browserWindow: Window = window;
          const originalSet = browserWindow.setInterval;
          const originalClear = browserWindow.clearInterval;
          const active = new Set<number>();
          browserWindow.setInterval = (handler, delay, ...args: unknown[]) => {
            const id = originalSet(handler, delay, ...args);
            if (delay === 100) {
              active.add(id);
            }
            return id;
          };
          browserWindow.clearInterval = (id) => {
            active.delete(id);
            originalClear(id);
          };
          return {
            count: () => active.size,
            restore: () => {
              browserWindow.setInterval = originalSet;
              browserWindow.clearInterval = originalClear;
            },
          };
        });
        try {
          const widget = page
            .locator('.jp-CodeCell')
            .first()
            .locator('.execute-time');
          await page.evaluate(() => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            const model = (panel.content.widgets[0] as CodeCell).model;
            model.executionState = 'running';
            model.setMetadata('execution', {
              'shell.execute_reply.started': new Date().toISOString(),
            });
          });
          await expect(widget).toContainText('Execution started at');
          // Keep both transitions in one browser task so no interval ticks
          // between removing the old node and starting the new execution.
          await page.evaluate(async () => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            const cell = panel.content.widgets[0] as CodeCell;
            const node = cell.node.querySelector('.execute-time');
            const removed = new Promise<void>((resolve) => {
              const observer = new MutationObserver(() => {
                if (!node.parentNode) {
                  observer.disconnect();
                  resolve();
                }
              });
              observer.observe(cell.node, { childList: true, subtree: true });
            });
            cell.model.executionState = 'idle';
            await removed;
            cell.model.executionState = 'running';
            cell.model.setMetadata('execution', {
              'iopub.execute_input': new Date().toISOString(),
            });
          });
          await expect(widget).toContainText('Execution started at');
          await expect
            .poll(() => timers.evaluate((timer) => timer.count()))
            .toBe(1);

          await page.evaluate(() => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            const model = (panel.content.widgets[0] as CodeCell).model;
            model.executionState = 'idle';
            model.setMetadata('execution', {
              ...model.getMetadata('execution'),
              'shell.execute_reply': new Date().toISOString(),
            });
          });
          await expect(widget).toContainText('Last executed');
          await expect
            .poll(() => timers.evaluate((timer) => timer.count()))
            .toBe(0);

          await page.evaluate(() => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            const model = (panel.content.widgets[0] as CodeCell).model;
            model.executionState = 'running';
            model.setMetadata('execution', {
              'iopub.execute_input': new Date().toISOString(),
            });
          });
          await expect(widget).toContainText('Execution started at');
          await expect
            .poll(() => timers.evaluate((timer) => timer.count()))
            .toBe(1);
          await page.evaluate(async () => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            await panel.context.save();
            await window.jupyterapp.commands.execute('application:close');
          });
          await expect
            .poll(() => timers.evaluate((timer) => timer.count()))
            .toBe(0);
        } finally {
          await timers.evaluate((timer) => timer.restore());
          await timers.dispose();
        }
      });
    }

    for (const positioning of ['left', 'hover']) {
      test.describe(`Windowed notebook (${positioning})`, () => {
        test.use({
          mockSettings: {
            ...galata.DEFAULT_SETTINGS,
            [SETTINGS_ID]: { positioning, showLiveExecutionTime },
            [NOTEBOOK_ID]: {
              ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
              windowingMode: 'full',
            },
          },
        });
        test('A cell becoming idle offscreen has no stale timing on return', async ({
          page,
          tmpPath,
        }) => {
          await page.contents.uploadFile(
            path.resolve(__dirname, '../notebooks/100_code_cells.ipynb'),
            `${tmpPath}/100_code_cells.ipynb`,
          );
          await openNotebook(page, `${tmpPath}/100_code_cells.ipynb`);
          const widget = page
            .locator('.jp-CodeCell')
            .first()
            .locator('.execute-time');
          await page.evaluate(async () => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            const cell = panel.content.widgets[1] as CodeCell;
            await cell.ready;
            cell.model.executionState = 'running';
            cell.model.setMetadata('execution', {
              'shell.execute_reply.started': new Date().toISOString(),
            });
          });
          await expect(widget).toContainText('Execution started at');
          await page.evaluate(async () => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            panel.content.activeCellIndex = 99;
            await panel.content.scrollToItem(99);
          });
          await page.waitForFunction(() => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            return !panel.content.widgets[1].inViewport;
          });
          await page.evaluate(() => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            (panel.content.widgets[1] as CodeCell).model.executionState =
              'idle';
          });
          await page.evaluate(async () => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            panel.content.activeCellIndex = 1;
            await panel.content.scrollToItem(1);
          });
          await page.waitForFunction(() => {
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            return panel.content.widgets[1].inViewport;
          });
          await expect(widget).toHaveCount(0);
        });
      });
    }

    for (const operation of [
      'duplicate',
      'copy and paste',
      'move',
      'delete, undo, and reopen',
      'save and reopen',
    ]) {
      test(`Incomplete timing after ${operation} during execution`, async ({
        page,
        tmpPath,
      }) => {
        await openSimpleNotebook(page, tmpPath);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const execution = page.evaluate(async () => {
          const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
          panel.content.activeCellIndex = 0;
          panel.content.widgets[0].model.sharedModel.setSource(
            'import time\ntime.sleep(3)',
          );
          await panel.sessionContext.ready;
          // Moving/deleting/closing a cell can dispose its execution future.
          await window.jupyterapp.commands
            .execute('notebook:run-cell')
            .catch(() => {});
        });
        await expect(page.locator('.execute-time')).toContainText([
          'Execution started at',
        ]);

        if (operation === 'save and reopen') {
          await saveAndReopen(page);
        } else {
          await page.evaluate(async (operation) => {
            const commands = window.jupyterapp.commands;
            const panel = window.jupyterapp.shell
              .currentWidget as NotebookPanel;
            panel.content.activeCellIndex = 0;
            panel.content.deselectAll();
            panel.model.sharedModel.clearUndoHistory();
            switch (operation) {
              case 'duplicate':
                await commands.execute('notebook:duplicate-below');
                break;
              case 'copy and paste':
                await commands.execute('notebook:copy-cell');
                await commands.execute('notebook:paste-cell-below');
                break;
              case 'move':
                await commands.execute('notebook:move-cell-down');
                break;
              case 'delete, undo, and reopen':
                await commands.execute('notebook:delete-cell');
                break;
            }
          }, operation);
        }

        await expect
          .poll(() =>
            page.evaluate(() => {
              const panel = window.jupyterapp.shell
                .currentWidget as NotebookPanel;
              return panel.sessionContext.session?.kernel?.status;
            }),
          )
          .toBe('idle');
        await execution;
        if (operation === 'delete, undo, and reopen') {
          await page.evaluate(async () => {
            await window.jupyterapp.commands.execute(
              'notebook:undo-cell-action',
            );
          });
          // Some JupyterLab versions restore a stale running execution state.
          // Reopening resets that upstream state while keeping saved metadata.
          await saveAndReopen(page);
        }

        const index =
          operation === 'duplicate' ||
          operation === 'copy and paste' ||
          operation === 'move'
            ? 1
            : 0;
        const state = await page.evaluate((index) => {
          const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
          const model = (panel.content.widgets[index] as CodeCell).model;
          return {
            state: model.executionState,
            execution: model.getMetadata('execution'),
            source: model.sharedModel.getSource(),
          };
        }, index);
        expect(state.state).toBe('idle');
        expect(state.source).toContain('time.sleep(3)');
        // JupyterLab 4.6 can clear execution metadata when restoring a cell;
        // older versions can retain its incomplete execution snapshot.
        if (operation !== 'delete, undo, and reopen' || state.execution) {
          expect(state.execution['iopub.execute_input']).toBeTruthy();
          expect(state.execution['shell.execute_reply']).toBeUndefined();
        }
        await expect(
          page.locator('.jp-CodeCell').nth(index).locator('.execute-time'),
        ).toHaveCount(0);
        expect(errors).toEqual([]);
      });
    }
  });
}
