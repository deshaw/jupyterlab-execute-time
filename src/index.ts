import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import {
  INotebookTracker,
  INotebookModel,
  NotebookPanel,
} from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import ExecuteTimeWidget, { PLUGIN_NAME } from './ExecuteTimeWidget';

class ExecuteTimeWidgetExtension implements DocumentRegistry.WidgetExtension {
  constructor(tracker: INotebookTracker, settingRegistry: ISettingRegistry) {
    this._settingRegistry = settingRegistry;
    this._tracker = tracker;
  }

  // We get a notebook panel because of addWidgetExtension('Notebook', ...) below
  createNew(
    panel: NotebookPanel,
    context: DocumentRegistry.IContext<INotebookModel>
  ) {
    return new ExecuteTimeWidget(panel, this._tracker, this._settingRegistry);
  }

  private _settingRegistry: ISettingRegistry;
  private _tracker: INotebookTracker;
}

/**
 * Initialization data for the jupyterlab-execute-time extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_NAME,
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    settingRegistry: ISettingRegistry
  ) => {
    app.docRegistry.addWidgetExtension(
      'Notebook',
      new ExecuteTimeWidgetExtension(tracker, settingRegistry)
    );

    // eslint-disable-next-line no-console
    console.log('JupyterLab extension jupyterlab-execute-time is activated!');
  },
};

export default extension;
