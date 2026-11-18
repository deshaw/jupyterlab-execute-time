import type { CodeCell } from '@jupyterlab/cells';
import type { NotebookPanel } from '@jupyterlab/notebook';
import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test,
} from '@jupyterlab/galata';
import * as path from 'path';
import { cleanup } from './utils';

const NOTEBOOK_ID = '@jupyterlab/notebook-extension:tracker';
const SETTINGS_ID = 'jupyterlab-execute-time:settings';
const START = '2026-09-29T12:00:00.000Z';
const END = '2026-09-29T12:00:01.000Z';
const LONG_RUN = 'import time\ntime.sleep(3)';

type Execution = Record<string, string | null>;

interface IIdleCell {
  execution: Execution;
  // `null` when the cell shows no label.
  label: string | RegExp | null;
}

function now(): string {
  return new Date().toISOString();
}

async function openPath(page: IJupyterLabPageFixture, notebookPath: string) {
  await page.evaluate(async (notebookPath) => {
    const panel = (await window.jupyterapp.commands.execute('docmanager:open', {
      path: notebookPath,
    })) as NotebookPanel;
    await panel.context.ready;
  }, notebookPath);
}

// `openNotebook` from utils opens through the file browser, about 1 s slower.
function openFixture(fileName: string) {
  return async ({
    page,
    tmpPath,
  }: {
    page: IJupyterLabPageFixture;
    tmpPath: string;
  }) => {
    await page.contents.uploadFile(
      path.resolve(__dirname, `../notebooks/${fileName}`),
      `${tmpPath}/${fileName}`,
    );
    await openPath(page, `${tmpPath}/${fileName}`);
  };
}

// Returns the path of the closed notebook.
async function saveAndClose(page: IJupyterLabPageFixture) {
  const notebookPath = await page.evaluate(async () => {
    const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
    const notebookPath = panel.context.path;
    await panel.context.save();
    await window.jupyterapp.commands.execute('application:close');
    return notebookPath;
  });
  await expect(page.locator('.jp-NotebookPanel')).toHaveCount(0);
  return notebookPath;
}

async function saveAndReopen(page: IJupyterLabPageFixture) {
  await openPath(page, await saveAndClose(page));
}

function timing(page: IJupyterLabPageFixture, index: number) {
  return page.locator(
    `.jp-Cell[data-windowed-list-index="${index}"] .execute-time`,
  );
}

async function openNotebookWith(
  page: IJupyterLabPageFixture,
  tmpPath: string,
  executions: Execution[],
) {
  const fileName = 'Execution_metadata.ipynb';
  const notebook = {
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
  };
  await page.contents.uploadContent(
    JSON.stringify(notebook),
    'text',
    `${tmpPath}/${fileName}`,
  );
  await openPath(page, `${tmpPath}/${fileName}`);
}

async function insertCells(
  page: IJupyterLabPageFixture,
  executions: Execution[],
) {
  await page.evaluate((executions) => {
    const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
    panel.model!.sharedModel.insertCells(
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
}

async function setExecution(
  page: IJupyterLabPageFixture,
  index: number,
  state: 'idle' | 'running',
  execution?: Execution,
) {
  await page.evaluate(
    async ({ index, state, execution }) => {
      const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
      const cell = panel.content.widgets[index] as CodeCell;
      await cell.ready;
      // JupyterLab sets the state before the metadata.
      cell.model.executionState = state;
      if (execution) {
        cell.model.setMetadata('execution', execution);
      }
    },
    { index, state, execution },
  );
}

async function expectLabels(page: IJupyterLabPageFixture, cells: IIdleCell[]) {
  // Labelled cells go first, so every cell has rendered before the checks
  // for a missing label.
  for (const [index, { execution, label }] of cells.entries()) {
    if (label !== null) {
      await expect(
        timing(page, index),
        JSON.stringify(execution),
      ).toContainText(label);
    }
  }
  for (const [index, { execution, label }] of cells.entries()) {
    if (label === null) {
      await expect(timing(page, index), JSON.stringify(execution)).toHaveCount(
        0,
      );
    }
  }
}

function subsets(timestamps: Execution): Execution[] {
  let result: Execution[] = [{}];
  for (const [key, value] of Object.entries(timestamps)) {
    result = [
      ...result,
      ...result.map((subset) => ({ ...subset, [key]: value })),
    ];
  }
  return result;
}

// The promise resolves when the run ends.
function startRun(page: IJupyterLabPageFixture, source: string) {
  return page.evaluate(async (source) => {
    const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
    panel.content.activeCellIndex = 0;
    panel.content.widgets[0].model.sharedModel.setSource(source);
    await panel.sessionContext.ready;
    // Moving or deleting a running cell can reject the run.
    await window.jupyterapp.commands
      .execute('notebook:run-cell')
      .catch(() => {});
  }, source);
}

async function runCommands(page: IJupyterLabPageFixture, commands: string[]) {
  await page.evaluate(async (commands) => {
    const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
    panel.content.activeCellIndex = 0;
    panel.content.deselectAll();
    for (const command of commands) {
      await window.jupyterapp.commands.execute(command);
    }
  }, commands);
}

async function waitForIdleKernel(page: IJupyterLabPageFixture) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        return panel.sessionContext.session?.kernel?.status;
      }),
    )
    .toBe('idle');
}

async function getCell(page: IJupyterLabPageFixture, index: number) {
  return page.evaluate((index) => {
    const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
    const model = (panel.content.widgets[index] as CodeCell).model;
    return {
      state: model.executionState,
      execution: model.getMetadata('execution') as Execution | undefined,
      source: model.sharedModel.getSource(),
    };
  }, index);
}

async function trackLiveIntervals(page: IJupyterLabPageFixture) {
  const intervals = await page.evaluateHandle(() => {
    const browserWindow: Window = window;
    const started: number[] = [];
    const active = new Set<number>();
    const { setInterval, clearInterval } = browserWindow;
    browserWindow.setInterval = (
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      const id = setInterval(handler, delay, ...args);
      // The live timer ticks every 100 ms.
      if (delay === 100) {
        started.push(id);
        active.add(id);
      }
      return id;
    };
    browserWindow.clearInterval = (id?: number) => {
      active.delete(id!);
      clearInterval(id);
    };
    return { started, active };
  });
  return {
    started: () => intervals.evaluate(({ started }) => started.length),
    active: () => intervals.evaluate(({ active }) => active.size),
  };
}

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    [NOTEBOOK_ID]: {
      ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
      windowingMode: 'none',
    },
  },
});
test.afterEach(cleanup);

// Only the cells with a start time and no end time have no label.
const IDLE_CELLS: IIdleCell[] = [
  { execution: { 'shell.execute_reply.started': START }, label: null },
  { execution: { 'iopub.execute_input': START }, label: null },
  {
    execution: {
      'shell.execute_reply.started': START,
      'iopub.execute_input': START,
    },
    label: null,
  },
  {
    execution: {
      'iopub.execute_input': START,
      'shell.execute_reply.started': START,
      'shell.execute_reply': END,
    },
    label: 'Last executed',
  },
  {
    execution: { 'iopub.execute_input': START, execution_failed: END },
    label: 'Failed',
  },
];

test.describe('Opening a notebook with idle cells', () => {
  for (const busy of [false, true]) {
    for (const idle of [false, true]) {
      test(`shows a label only for complete timing (busy=${busy}, idle=${idle})`, async ({
        page,
        tmpPath,
      }) => {
        const statuses: Execution = {
          ...(busy ? { 'iopub.status.busy': START } : {}),
          ...(idle ? { 'iopub.status.idle': END } : {}),
        };
        const cells = IDLE_CELLS.map(({ execution, label }) => ({
          execution: { ...statuses, ...execution },
          label,
        }));
        await openNotebookWith(
          page,
          tmpPath,
          cells.map(({ execution }) => execution),
        );

        await expectLabels(page, cells);
      });
    }
  }

  test('keeps the execution metadata', async ({ page, tmpPath }) => {
    const executions = IDLE_CELLS.map(({ execution }) => execution);
    await openNotebookWith(page, tmpPath, executions);
    // The last cell renders last.
    await expect(timing(page, executions.length - 1)).toContainText('Failed');

    const saved = await page.evaluate(() => {
      const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
      return panel.content.widgets.map((cell) =>
        cell.model.getMetadata('execution'),
      );
    });
    expect(saved).toEqual(executions);
  });
});

test.describe('Inserting idle cells', () => {
  test.beforeEach(openFixture('Simple_notebook.ipynb'));

  test('shows no running label for any combination of timestamps', async ({
    page,
  }) => {
    const executions = subsets({
      'iopub.status.busy': START,
      'iopub.execute_input': START,
      'shell.execute_reply.started': START,
      'iopub.status.idle': END,
      'shell.execute_reply': END,
      execution_failed: END,
    });
    await insertCells(page, executions);
    // The last cell has every timestamp, so it shows a failure.
    await expect(timing(page, executions.length - 1)).toContainText('Failed');

    await expect(
      page.locator('.execute-time', { hasText: 'Execution started at' }),
    ).toHaveCount(0);
  });

  test('treats empty end times as missing', async ({ page }) => {
    const cells: IIdleCell[] = [];
    for (const start of [
      'iopub.execute_input',
      'shell.execute_reply.started',
    ]) {
      for (const end of ['shell.execute_reply', 'execution_failed']) {
        for (const empty of [null, '']) {
          cells.push({
            execution: { [start]: START, [end]: empty },
            label: null,
          });
        }
      }
    }
    const input = { 'iopub.execute_input': START };
    cells.push(
      {
        execution: {
          ...input,
          'shell.execute_reply': null,
          execution_failed: END,
        },
        label: 'Failed',
      },
      {
        execution: {
          ...input,
          'shell.execute_reply': END,
          execution_failed: null,
        },
        label: 'Last executed',
      },
      {
        execution: {
          ...input,
          'shell.execute_reply': '',
          execution_failed: END,
        },
        label: /^Failed .* in 1\.00s/,
      },
    );
    await insertCells(
      page,
      cells.map(({ execution }) => execution),
    );

    await expectLabels(page, cells);
  });
});

test.describe('A running cell that turns idle without a reply', () => {
  test.beforeEach(openFixture('Simple_notebook.ipynb'));
  test.beforeEach(async ({ page }) => {
    await setExecution(page, 0, 'running', {
      'shell.execute_reply.started': now(),
    });
    await expect(timing(page, 0)).toContainText('Execution started at');
    await setExecution(page, 0, 'idle');
  });

  test('loses its label', async ({ page }) => {
    await expect(timing(page, 0)).toHaveCount(0);
  });

  test('shows the next run when it completes', async ({ page }) => {
    const started = { 'iopub.execute_input': now() };
    await setExecution(page, 0, 'running', started);
    await expect(timing(page, 0)).toContainText('Execution started at');

    await setExecution(page, 0, 'idle', {
      ...started,
      'shell.execute_reply': now(),
    });
    await expect(timing(page, 0)).toContainText('Last executed');
    await expect(timing(page, 0).locator('span').nth(1)).toBeEmpty();
  });

  test('shows the live time of a real run', async ({ page }) => {
    const run = startRun(page, 'import time\ntime.sleep(1)');
    await expect(timing(page, 0)).toContainText('Execution started at');
    await expect(timing(page, 0).locator('span').nth(1)).not.toBeEmpty();
    await run;
    await expect(timing(page, 0)).toContainText('Last executed');
  });

  test('keeps a completed run in the history of a real run', async ({
    page,
  }) => {
    const started = { 'iopub.execute_input': now() };
    await setExecution(page, 0, 'running', started);
    await setExecution(page, 0, 'idle', {
      ...started,
      'shell.execute_reply': now(),
    });
    await expect(timing(page, 0)).toContainText('Last executed');
    const completed = await timing(page, 0).getAttribute(
      'data-prev-execution-time',
    );

    await startRun(page, 'import time\ntime.sleep(1)');
    await expect(timing(page, 0)).toHaveAttribute(
      'title',
      `Previous Runs:\n${completed}`,
    );
  });
});

test.describe('Live timer intervals', () => {
  test.beforeEach(openFixture('Simple_notebook.ipynb'));

  test('A cell run again after turning idle has one interval', async ({
    page,
  }) => {
    const intervals = await trackLiveIntervals(page);
    await setExecution(page, 0, 'running', {
      'shell.execute_reply.started': now(),
    });
    await expect(timing(page, 0)).toContainText('Execution started at');
    await setExecution(page, 0, 'idle');
    await expect(timing(page, 0)).toHaveCount(0);

    await setExecution(page, 0, 'running', { 'iopub.execute_input': now() });
    await expect(timing(page, 0)).toContainText('Execution started at');
    await expect.poll(intervals.active).toBe(1);
  });

  test('A running cell keeps one interval when its metadata changes', async ({
    page,
  }) => {
    const intervals = await trackLiveIntervals(page);
    const started = { 'iopub.execute_input': now() };
    await setExecution(page, 0, 'running', started);
    await expect.poll(intervals.active).toBe(1);

    // The kernel reports idle shortly before it replies.
    await setExecution(page, 0, 'running', {
      ...started,
      'iopub.status.idle': now(),
    });
    await expect.poll(intervals.started).toBe(2);
    expect(await intervals.active()).toBe(1);
  });

  test('A completed run has no interval', async ({ page }) => {
    const intervals = await trackLiveIntervals(page);
    const started = { 'iopub.execute_input': now() };
    await setExecution(page, 0, 'running', started);
    await expect.poll(intervals.active).toBe(1);

    await setExecution(page, 0, 'idle', {
      ...started,
      'shell.execute_reply': now(),
    });
    await expect(timing(page, 0)).toContainText('Last executed');
    await expect.poll(intervals.active).toBe(0);
  });

  test('Closing the notebook clears the interval of a running cell', async ({
    page,
  }) => {
    const intervals = await trackLiveIntervals(page);
    await setExecution(page, 0, 'running', { 'iopub.execute_input': now() });
    await expect.poll(intervals.active).toBe(1);

    await saveAndClose(page);
    await expect.poll(intervals.active).toBe(0);
  });
});

for (const positioning of ['left', 'hover']) {
  test.describe(`Windowed notebook (${positioning})`, () => {
    test.use({
      mockSettings: {
        ...galata.DEFAULT_SETTINGS,
        [SETTINGS_ID]: { positioning },
        [NOTEBOOK_ID]: {
          ...galata.DEFAULT_SETTINGS[NOTEBOOK_ID],
          windowingMode: 'full',
        },
      },
    });
    test.beforeEach(openFixture('100_code_cells.ipynb'));

    async function scrollToCell(page: IJupyterLabPageFixture, index: number) {
      await page.evaluate(async (index) => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        panel.content.activeCellIndex = index;
        await panel.content.scrollToItem(index);
      }, index);
    }

    function isInViewport(page: IJupyterLabPageFixture, index: number) {
      return page.evaluate((index) => {
        const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
        return panel.content.widgets[index].inViewport;
      }, index);
    }

    test('A cell that turns idle offscreen has no label on return', async ({
      page,
    }) => {
      await setExecution(page, 1, 'running', {
        'shell.execute_reply.started': now(),
      });
      await expect(timing(page, 1)).toContainText('Execution started at');
      await scrollToCell(page, 99);
      await expect.poll(() => isInViewport(page, 1)).toBe(false);

      await setExecution(page, 1, 'idle');
      await scrollToCell(page, 1);
      await expect.poll(() => isInViewport(page, 1)).toBe(true);
      await expect(timing(page, 1)).toHaveCount(0);
    });
  });
}

test.describe('A cell changed while it runs', () => {
  test.beforeEach(openFixture('Simple_notebook.ipynb'));

  // `index` is where the run without a reply ends up.
  const changes: {
    name: string;
    index: number;
    change: (page: IJupyterLabPageFixture) => Promise<void>;
  }[] = [
    {
      name: 'duplicated',
      index: 1,
      change: (page) => runCommands(page, ['notebook:duplicate-below']),
    },
    {
      name: 'copied and pasted',
      index: 1,
      change: (page) =>
        runCommands(page, ['notebook:copy-cell', 'notebook:paste-cell-below']),
    },
    {
      name: 'moved',
      index: 1,
      change: (page) => runCommands(page, ['notebook:move-cell-down']),
    },
    { name: 'saved and reopened', index: 0, change: saveAndReopen },
  ];
  for (const { name, index, change } of changes) {
    test(`has no label when ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const run = startRun(page, LONG_RUN);
      await expect(timing(page, 0)).toContainText('Execution started at');

      await change(page);
      await waitForIdleKernel(page);
      await run;

      const cell = await getCell(page, index);
      expect(cell.source).toBe(LONG_RUN);
      expect(cell.state).toBe('idle');
      expect(cell.execution?.['iopub.execute_input']).toBeTruthy();
      expect(cell.execution?.['shell.execute_reply']).toBeUndefined();
      await expect(timing(page, index)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('has no label when deleted, restored and reopened', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const run = startRun(page, LONG_RUN);
    await expect(timing(page, 0)).toContainText('Execution started at');
    // Undo restores the deleted cell, not the source set by `startRun`.
    await page.evaluate(() => {
      const panel = window.jupyterapp.shell.currentWidget as NotebookPanel;
      panel.model!.sharedModel.clearUndoHistory();
    });

    await runCommands(page, ['notebook:delete-cell']);
    await waitForIdleKernel(page);
    await run;
    await runCommands(page, ['notebook:undo-cell-action']);
    // Some JupyterLab versions restore a stale running execution state.
    // Reopening resets that upstream state while keeping saved metadata.
    await saveAndReopen(page);

    const cell = await getCell(page, 0);
    expect(cell.source).toBe(LONG_RUN);
    expect(cell.state).toBe('idle');
    // JupyterLab 4.6 can clear execution metadata when restoring a cell;
    // older versions can retain its incomplete execution snapshot.
    if (cell.execution) {
      expect(cell.execution['iopub.execute_input']).toBeTruthy();
      expect(cell.execution['shell.execute_reply']).toBeUndefined();
    }
    await expect(timing(page, 0)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
