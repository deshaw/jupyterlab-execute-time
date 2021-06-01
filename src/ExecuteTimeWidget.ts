import { Widget } from '@lumino/widgets';
import { JSONExt, JSONObject } from '@lumino/coreutils';
import { NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  IObservableJSON,
  IObservableList,
  IObservableUndoableList
} from '@jupyterlab/observables';
import { Cell, CodeCell, ICellModel } from '@jupyterlab/cells';
import { getTimeDiff, getTimeString } from './formatters';

export const PLUGIN_NAME = 'jupyterlab-execute-time';
const EXECUTE_TIME_CLASS = 'execute-time';

// How long do we animate the color for
const ANIMATE_TIME_MS = 1000;
const ANIMATE_CSS = `executeHighlight ${ANIMATE_TIME_MS}ms`;

export interface IExecuteTimeSettings {
  enabled: boolean;
  highlight: boolean;
  positioning: string;
}

export default class ExecuteTimeWidget extends Widget {
  constructor(panel: NotebookPanel, settingRegistry: ISettingRegistry) {
    super();
    this._panel = panel;
    this.updateConnectedCell = this.updateConnectedCell.bind(this);
    settingRegistry.load(`${PLUGIN_NAME}:settings`).then(
      (settings: ISettingRegistry.ISettings) => {
        this._updateSettings(settings);
        settings.changed.connect(this._updateSettings.bind(this));
      },
      (err: Error) => {
        console.error(
          `jupyterlab-execute-time: Could not load settings, so did not active ${PLUGIN_NAME}: ${err}`
        );
      }
    );
  }

  updateConnectedCell(
    cells: IObservableUndoableList<ICellModel>,
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
      cellModel.metadata.changed.connect(fn);
    }
    // Always re-render cells.
    // In case there was already metadata: do not highlight on first load.
    this._cellMetadataChanged(cellModel, true);
  }

  _deregisterMetadataChanges(cellModel: ICellModel) {
    const fn = this._cellSlotMap[cellModel.id];
    if (fn) {
      cellModel.metadata.changed.disconnect(fn);
      const codeCell = this._getCodeCell(cellModel);
      if (codeCell) {
        this._removeExecuteNode(codeCell);
      }
    }
    delete this._cellSlotMap[cellModel.id];
  }

  _cellMetadataChanged(cellModel: ICellModel, disableHighlight = false) {
    const codeCell = this._getCodeCell(cellModel);
    if (codeCell) {
      this._updateCodeCell(codeCell, disableHighlight);
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
  _updateCodeCell(cell: CodeCell, disableHighlight: boolean) {
    const executionMetadata = cell.model.metadata.get(
      'execution'
    ) as JSONObject;
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
        if (!cell.inputHidden) {
          parentNode.append(executionTimeNode);
        }
      } else if (executionTimeNode.parentNode !== parentNode) {
        executionTimeNode.remove();
        parentNode.append(executionTimeNode);
      }

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
      executionTimeNode.className = `${EXECUTE_TIME_CLASS} ${positioningClass}`;

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

      let msg = '';
      if (endTime) {
        msg = `Last executed at ${getTimeString(endTime)} in ${getTimeDiff(
          endTime,
          startTime
        )}`;
      } else if (startTime) {
        msg = `Execution started at ${getTimeString(startTime)}`;
      } else if (queuedTime) {
        msg = `Execution queued at ${getTimeString(queuedTime)}`;
      }
      if (executionTimeNode.innerText !== msg) {
        executionTimeNode.innerText = msg;
        if (!disableHighlight && this._settings.highlight && endTimeStr) {
          executionTimeNode.style.setProperty('animation', ANIMATE_CSS);
          setTimeout(
            () => executionTimeNode.style.removeProperty('animation'),
            ANIMATE_TIME_MS
          );
        }
      }
    } else {
      // Clean up in case it was removed
      this._removeExecuteNode(cell);
    }
  }

  _updateSettings(settings: ISettingRegistry.ISettings) {
    this._settings.enabled = settings.get('enabled').composite as boolean;
    this._settings.highlight = settings.get('highlight').composite as boolean;
    this._settings.positioning = settings.get('positioning')
      .composite as string;

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
    [id: string]: (
      sender: IObservableJSON,
      args: IObservableJSON.IChangedArgs
    ) => void;
  } = {};
  private _panel: NotebookPanel;
  private _settings: IExecuteTimeSettings = {
    enabled: false,
    highlight: true,
    positioning: 'left'
  };
}
