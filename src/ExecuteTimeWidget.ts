import { Widget } from '@lumino/widgets';
import { JSONExt, JSONObject } from '@lumino/coreutils';
import {
  NotebookPanel,
  INotebookTracker,
  type CellList,
} from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IObservableList } from '@jupyterlab/observables';
import { Cell, CodeCell, ICellModel } from '@jupyterlab/cells';
import { getTimeDiff, getTimeString, validateDateFormat } from './formatters';
import { differenceInMilliseconds } from 'date-fns';
import { showErrorMessage } from '@jupyterlab/apputils';

export const PLUGIN_NAME = 'jupyterlab-execute-time';
const EXECUTE_TIME_CLASS = 'execute-time';

const TOOLTIP_PREFIX = 'Previous Runs:';
const PREV_DATA_EXECUTION_TIME_ATTR = 'data-prev-execution-time';

// How long do we animate the color for
const ANIMATE_TIME_MS = 1000;
const ANIMATE_CSS = `executeHighlight ${ANIMATE_TIME_MS}ms`;

export interface IExecuteTimeSettings {
  enabled: boolean;
  highlight: boolean;
  positioning: string;
  minTime: number;
  textContrast: string;
  showLiveExecutionTime: boolean;
  showDate: boolean;
  historyCount: number;
  dateFormat: string;
}

export default class ExecuteTimeWidget extends Widget {
  constructor(
    panel: NotebookPanel,
    tracker: INotebookTracker,
    settingRegistry: ISettingRegistry
  ) {
    super();
    this._panel = panel;
    this._tracker = tracker;
    this._settingRegistry = settingRegistry;

    this.updateConnectedCell = this.updateConnectedCell.bind(this);
    settingRegistry.load(`${PLUGIN_NAME}:settings`).then(
      (settings: ISettingRegistry.ISettings) => {
        this._updateSettings(settings);
        settings.changed.connect(this._updateSettings.bind(this));

        // If the plugin is enabled, force recording of timing
        // We only do this once (not on every settings update) in case the user tries to turn it off
        if (settings.get('enabled').composite) {
          this._settingRegistry
            .load('@jupyterlab/notebook-extension:tracker')
            .then(
              (nbSettings: ISettingRegistry.ISettings) =>
                nbSettings.set('recordTiming', true),
              (err: Error) => {
                console.error(
                  `jupyterlab-execute-time: Could not force metadata recording: ${err}`
                );
              }
            );
        }
      },
      (err: Error) => {
        console.error(
          `jupyterlab-execute-time: Could not load settings, so did not active ${PLUGIN_NAME}: ${err}`
        );
      }
    );
  }

  /**
   * Handle `CellList.changed` signal.
   */
  updateConnectedCell(
    sender: CellList,
    changed: IObservableList.IChangedArgs<ICellModel>
  ) {
    // When a cell is moved it's model gets re-created so we need to update
    // the `metadataChanged` listeners.

    // When cells are moved around the `CellList.changed` signal is first
    // emitted with "add" type and the cell model information and then
    // with "remove" type but lacking the old model (it is `undefined`).
    // This causes a problem for the sequence of registering and deregistering
    // listeners for the `metadataChanged` signal (register can be called when
    // the cell was no yet removed from `this._cellSlotMap`, and deregister
    // could be called with `undefined` value hence unable to remove it).
    // There are two possible solutions:
    // - (a) go over the list of cells and compare it with `cellSlotMap` (slow)
    // - (b) deregister the cell model as it gets disposed just before
    //      `CellList.changed` signals are emitted; we can do this by
    //       listening to the `ICellModel.sharedModel.disposed` signal.
    // The (b) solution is implemented in `_registerMetadataChanges` method.

    // Reference:
    // https://github.com/jupyterlab/jupyterlab/blob/4.0.x/packages/notebook/src/celllist.ts#L131-L159

    changed.oldValues.forEach(this._deregisterMetadataChanges.bind(this));
    changed.newValues.forEach(this._registerMetadataChanges.bind(this));
  }

  _registerMetadataChanges(cellModel: ICellModel) {
    if (!(cellModel.id in this._cellSlotMap)) {
      // Register signal handler with `cellModel` stored in closure.
      const fn = () => this._cellMetadataChanged(cellModel);
      this._cellSlotMap[cellModel.id] = fn;
      cellModel.metadataChanged.connect(fn);

      // Copy cell model identifier and store a reference to `metadataChanged`
      // signal to keep them available even during cell model disposal.
      const id = cellModel.id;
      const metadataChanged = cellModel.metadataChanged;

      // Register a model disposal handler on the underlying shared model,
      // see the explanation in `updateConnectedCell()` method.
      const deregisterOnDisposal = () => {
        this._deregisterMetadataChanges({ metadataChanged, id } as ICellModel);
        cellModel.sharedModel.disposed.disconnect(deregisterOnDisposal);
      };
      cellModel.sharedModel.disposed.connect(deregisterOnDisposal);
    }
    // Always re-render cells.
    // In case there was already metadata: do not highlight on first load.
    this._cellMetadataChanged(cellModel, true);
  }

  _deregisterMetadataChanges(cellModel: ICellModel) {
    if (cellModel !== undefined) {
      const fn = this._cellSlotMap[cellModel.id];
      if (fn) {
        cellModel.metadataChanged.disconnect(fn);
        const codeCell = this._getCodeCell(cellModel);
        if (codeCell) {
          this._removeExecuteNode(codeCell);
        }
      }
      delete this._cellSlotMap[cellModel.id];
    }
  }

  _cellMetadataChanged(cellModel: ICellModel, disableHighlight = false) {
    const codeCell = this._getCodeCell(cellModel);
    if (codeCell) {
      this._updateCodeCell(codeCell, disableHighlight).catch(console.error);
    } else {
      if (cellModel.type === 'code') {
        console.error(`Could not find code cell for model: ${cellModel}`);
      }
    }
  }

  /**
   * Return a codeCell for this model if there is one. This will return null
   * in cases of non-code cells.
   *
   * @param cellModel
   * @private
   */
  _getCodeCell(cellModel: ICellModel): CodeCell | null {
    if (cellModel.type === 'code') {
      const cell = this._panel.content.widgets.find(
        (widget: Cell) => widget.model === cellModel
      );
      return cell as CodeCell;
    }
    return null;
  }

  /**
   * If there was a executeTime node added, remove it
   * @param cell
   * @private
   */
  _removeExecuteNode(cell: CodeCell) {
    const executionTimeNode = cell.node.querySelector(`.${EXECUTE_TIME_CLASS}`);
    if (executionTimeNode) {
      executionTimeNode.remove();
    }
  }

  /**
   * Update the code cell to reflect the metadata
   * @param cell
   * @private
   */
  async _updateCodeCell(cell: CodeCell, disableHighlight: boolean) {
    // First update and store current update number.
    const updateNumber = this._increaseUpdateCounter(cell);
    // Cells don't have inputArea attributes until they are ready; wait for this.
    // Cells can be in the viewport but not yet ready when the `defer` mode is used.
    await cell.ready;
    // Wait until the cell is in the viewport before querying for the node,
    // as otherwise it would not be found as contents are detached from DOM.
    if (!cell.inViewport) {
      const shouldContinue = await this._cellInViewport(cell, updateNumber);
      if (!shouldContinue) {
        return;
      }
    }
    const executionMetadata = cell.model.getMetadata('execution') as JSONObject;
    if (executionMetadata && JSONExt.isObject(executionMetadata)) {
      let executionTimeNode: HTMLDivElement = cell.node.querySelector(
        `.${EXECUTE_TIME_CLASS}`
      );

      const parentNode =
        this._settings.positioning === 'hover'
          ? cell.inputArea.node.parentNode
          : cell.inputArea.editorWidget.node;

      if (!executionTimeNode) {
        executionTimeNode = document.createElement('div') as HTMLDivElement;
        executionTimeNode.appendChild(document.createElement('span'));
        // Use this over gap as hover is not a flexbox
        const spacer = document.createElement('div');
        spacer.style.minWidth = '12px';
        executionTimeNode.appendChild(spacer);
        executionTimeNode.appendChild(document.createElement('span'));

        if (!cell.inputHidden) {
          parentNode.append(executionTimeNode);
        }
      } else if (executionTimeNode.parentNode !== parentNode) {
        executionTimeNode.remove();
        parentNode.append(executionTimeNode);
      }
      // Ensure that the current cell onclick actives the current cell
      executionTimeNode.onclick = () => {
        // This check makes sure that range selections (mostly) work
        // activate breaks the range selection otherwise
        if (this._tracker.activeCell !== cell) {
          cell.activate();
        }
      };

      let positioning;
      switch (this._settings.positioning) {
        case 'left':
          positioning = 'left';
          break;
        case 'right':
          positioning = 'right';
          break;
        case 'hover':
          positioning = 'hover';
          break;
        default:
          console.error(
            `'${positioning}' is not a valid type for the setting 'positioning'`
          );
      }
      const positioningClass = `${EXECUTE_TIME_CLASS}-positioning-${this._settings.positioning}`;
      const textContrastClass = `${EXECUTE_TIME_CLASS}-contrast-${this._settings.textContrast}`;
      executionTimeNode.className = `${EXECUTE_TIME_CLASS} ${positioningClass} ${textContrastClass}`;

      // More info about timing: https://jupyter-client.readthedocs.io/en/stable/messaging.html#messages-on-the-shell-router-dealer-channel
      // A cell is queued when the kernel has received the message
      // A cell is running when the kernel has started executing
      // A cell is done when the execute_reply has has finished
      const queuedTimeStr = executionMetadata['iopub.status.busy'] as
        | string
        | null;
      const queuedTime = queuedTimeStr ? new Date(queuedTimeStr) : null;
      const startTimeStr = (executionMetadata['shell.execute_reply.started'] ||
        executionMetadata['iopub.execute_input']) as string | null;
      // Using started is more accurate, but we don't get this until after the cell has finished executing
      const startTime = startTimeStr ? new Date(startTimeStr) : null;
      // This is the time the kernel is done processing and starts replying
      const failed = executionMetadata['execution_failed'];
      const endTimeStr = (executionMetadata['shell.execute_reply'] ??
        failed) as string | null;
      const endTime = endTimeStr ? new Date(endTimeStr) : null;
      // shell.execute_reply can be one of:  One of: 'ok' OR 'error' OR 'aborted'
      // We want to remove the cases where it's not 'ok', but that's not in the metadata
      // So we assume that if iopub.execute_input never happened, the cell never ran, thus not ok.
      // This is assumed to be true because per the spec below, the code being executed should be sent to all frontends
      // See: https://jupyter-client.readthedocs.io/en/stable/messaging.html#messages-on-the-shell-router-dealer-channel
      // See: https://jupyter-client.readthedocs.io/en/stable/messaging.html#code-inputs
      const isLikelyAborted =
        endTimeStr && !executionMetadata['iopub.execute_input'];

      let msg = '';
      if (isLikelyAborted) {
        msg = '';
      } else if (endTime) {
        if (
          this._settings.minTime <=
          differenceInMilliseconds(endTime, startTime) / 1000.0
        ) {
          const executionTime = getTimeDiff(endTime, startTime);
          const lastExecutionTime = executionTimeNode.getAttribute(
            PREV_DATA_EXECUTION_TIME_ATTR
          );
          // Store the last execution time in the node to be used for various options
          executionTimeNode.setAttribute(
            PREV_DATA_EXECUTION_TIME_ATTR,
            executionTime
          );
          // Only add a tooltip for all non-displayed execution times.
          if (this._settings.historyCount > 0 && lastExecutionTime) {
            let tooltip = executionTimeNode.getAttribute('title');
            const executionTimes = [lastExecutionTime];
            if (tooltip) {
              executionTimes.push(
                ...tooltip.substring(TOOLTIP_PREFIX.length + 1).split('\n')
              );
              // JS does the right thing of having empty items if extended
              executionTimes.length = this._settings.historyCount;
            }
            tooltip = `${TOOLTIP_PREFIX}\n${executionTimes.join('\n')}`;
            executionTimeNode.setAttribute('title', tooltip);
          }
          executionTimeNode.children[2].textContent = '';

          msg = failed ? 'Failed' : 'Last executed';
          if (this._settings.showDate) {
            msg += ` at ${getTimeString(endTime, this._settings.dateFormat)}`;
          }
          msg += ` in ${executionTime}`;
        }
      } else if (startTime) {
        if (this._settings.showLiveExecutionTime) {
          const lastRunTime = executionTimeNode.getAttribute(
            'data-prev-execution-time'
          );
          const workingTimer = setInterval(() => {
            if (
              !executionTimeNode.children[0].textContent.startsWith(
                'Execution started at'
              )
            ) {
              clearInterval(workingTimer);
              return;
            }

            const executionMetadata = cell.model.getMetadata(
              'execution'
            ) as JSONObject;
            if (!executionMetadata || executionMetadata['execution_failed']) {
              // (if cell got re-scheduled the metadata will be empty too)
              clearInterval(workingTimer);
              return this._updateCodeCell(cell, disableHighlight);
            }

            if (
              this._settings.minTime <=
              differenceInMilliseconds(new Date(), startTime) / 1000.0
            ) {
              const executionTime = getTimeDiff(new Date(), startTime);

              executionTimeNode.children[2].textContent = `${executionTime} ${
                lastRunTime ? `(${lastRunTime})` : ''
              }`;
            }
          }, 100);
        }
        msg = `Execution started at ${getTimeString(
          startTime,
          this._settings.dateFormat
        )}`;
      } else if (queuedTime) {
        const lastRunTime = executionTimeNode.getAttribute(
          'data-prev-execution-time'
        );
        if (this._settings.showLiveExecutionTime && lastRunTime) {
          executionTimeNode.children[2].textContent = `N/A (${lastRunTime})`;
        }

        msg = `Execution queued at ${getTimeString(
          queuedTime,
          this._settings.dateFormat
        )}`;
      }
      if (executionTimeNode.textContent !== msg) {
        executionTimeNode.children[0].textContent = msg;

        if (!disableHighlight && this._settings.highlight && endTimeStr) {
          executionTimeNode.style.setProperty('animation', ANIMATE_CSS);
          setTimeout(
            () => executionTimeNode.style.removeProperty('animation'),
            ANIMATE_TIME_MS
          );
        }
      }
    } else {
      // Hide it if data was removed (e.g. clear output).
      // Don't remove as element store history, which are useful for later showing past runtime.
      const executionTimeNode = cell.node.querySelector(
        `.${EXECUTE_TIME_CLASS}`
      );
      if (executionTimeNode) {
        executionTimeNode.classList.add('execute-time-hidden');
      }
    }
  }

  _updateSettings(settings: ISettingRegistry.ISettings) {
    this._settings.enabled = settings.get('enabled').composite as boolean;
    this._settings.highlight = settings.get('highlight').composite as boolean;
    this._settings.positioning = settings.get('positioning')
      .composite as string;
    this._settings.minTime = settings.get('minTime').composite as number;
    this._settings.textContrast = settings.get('textContrast')
      .composite as string;
    this._settings.showLiveExecutionTime = settings.get('showLiveExecutionTime')
      .composite as boolean;
    this._settings.showDate = settings.get('showDate').composite as boolean;
    this._settings.historyCount = settings.get('historyCount')
      .composite as number;

    const dateFormat = settings.get('dateFormat').composite as string;
    const formatValidationResult = validateDateFormat(dateFormat);
    if (formatValidationResult.isValid) {
      this._settings.dateFormat = dateFormat;
    } else {
      // fallback to default
      this._settings.dateFormat = 'yyy-MM-dd HH:mm:ss';
      // warn user once
      void showErrorMessage(
        'Invalid date format in Execute Time extension setting',
        formatValidationResult.message
      );
    }

    const cells = this._panel.context.model.cells;
    if (this._settings.enabled) {
      cells.changed.connect(this.updateConnectedCell);
      for (let i = 0; i < cells.length; ++i) {
        this._registerMetadataChanges(cells.get(i));
      }
    } else {
      cells.changed.disconnect(this.updateConnectedCell);
      for (let i = 0; i < cells.length; ++i) {
        this._deregisterMetadataChanges(cells.get(i));
      }
    }
  }

  /**
   * Generate a promise which resolves to `true` when cell enters the viewport,
   * or to `false` when an update newer than given `updateNumber` arrives.
   */
  private _cellInViewport(
    cell: CodeCell,
    updateNumber: number
  ): Promise<boolean> {
    return new Promise<boolean>((resolved) => {
      const clearHandlers = () => {
        cell.inViewportChanged.disconnect(handler);
        cell.disposed.disconnect(disposedHandler);
        this._panel.disposed.disconnect(disposedHandler);
      };
      const handler = (_emitter: Cell<ICellModel>, attached: boolean) => {
        const currentNumber = this._updateCounter.get(cell);
        if (updateNumber !== currentNumber) {
          clearHandlers();
          return resolved(false);
        }
        if (attached) {
          clearHandlers();
          return resolved(true);
        }
      };
      const disposedHandler = () => {
        // Disconnect handlers and resolve promise on cell/notebook disposal.
        clearHandlers();
        return resolved(false);
      };
      cell.inViewportChanged.connect(handler);
      // Listen to `dispose` signal of individual cells to clear promise
      // when cells get deleted before entering the viewport (ctrl + a, dd).
      cell.disposed.connect(disposedHandler);
      // Listen to notebook too because the `disposed` signal of individual
      // cells is not fired when closing the entire notebook.
      this._panel.disposed.connect(disposedHandler);
    });
  }

  /**
   * Increase counter of updates ever scheduled for a given `cell`.
   * Returns the current counter value for the given `cell`.
   */
  private _increaseUpdateCounter(cell: CodeCell): number {
    const newValue = (this._updateCounter.get(cell) ?? 0) + 1;
    this._updateCounter.set(cell, newValue);
    return newValue;
  }

  /**
   * The counter of updates ever scheduled for each existing cell.
   */
  private _updateCounter: WeakMap<CodeCell, number> = new WeakMap();
  private _cellSlotMap: {
    [id: string]: () => void;
  } = {};
  private _tracker: INotebookTracker;
  private _panel: NotebookPanel;
  private _settingRegistry: ISettingRegistry;
  private _settings: IExecuteTimeSettings = {
    enabled: false,
    highlight: true,
    positioning: 'left',
    minTime: 0,
    textContrast: 'high',
    showLiveExecutionTime: true,
    showDate: true,
    historyCount: 5,
    dateFormat: 'yyy-MM-dd HH:mm:ss',
  };
}
