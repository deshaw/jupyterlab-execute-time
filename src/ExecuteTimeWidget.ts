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
import { getTimeDiff, getTimeString } from './formatters';
import { differenceInMilliseconds } from 'date-fns';

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
  historyCount: number;
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

        // If the plugin is enabled, force recoding of timing
        // We only do this once (not on every settings update) in case the user tries to trun it off
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

  updateConnectedCell(
    sender: CellList,
    changed: IObservableList.IChangedArgs<ICellModel>
  ) {
    // While we could look at changed.type, it's easier to just remove all
    // oldValues and add back all new values
    changed.oldValues.forEach(this._deregisterMetadataChanges.bind(this));
    changed.newValues.forEach(this._registerMetadataChanges.bind(this));
  }

  _registerMetadataChanges(cellModel: ICellModel) {
    if (!(cellModel.id in this._cellSlotMap)) {
      const fn = () => this._cellMetadataChanged(cellModel);
      this._cellSlotMap[cellModel.id] = fn;
      cellModel.metadataChanged.connect(fn);
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
    // Cells don't have inputArea attributes until they are ready; wait for this
    await cell.ready;
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
      const endTimeStr = executionMetadata['shell.execute_reply'] as
        | string
        | null;
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

          msg = `Last executed at ${getTimeString(
            endTime
          )} in ${executionTime}`;
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
        msg = `Execution started at ${getTimeString(startTime)}`;
      } else if (queuedTime) {
        const lastRunTime = executionTimeNode.getAttribute(
          'data-prev-execution-time'
        );
        if (this._settings.showLiveExecutionTime && lastRunTime) {
          executionTimeNode.children[2].textContent = `N/A (${lastRunTime})`;
        }

        msg = `Execution queued at ${getTimeString(queuedTime)}`;
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
    this._settings.historyCount = settings.get('historyCount')
      .composite as number;

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
    historyCount: 5,
  };
}
