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
  constructor(tracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
    this._settings = settings;
    this._tracker = tracker;
  }

  // We get a notebook panel because of addWidgetExtension('Notebook', ...) below
  createNew(
    panel: NotebookPanel,
    context: DocumentRegistry.IContext<INotebookModel>
  ) {
    return new ExecuteTimeWidget(panel, this._tracker, this._settings);
  }

  private _settings: ISettingRegistry.ISettings;
  private _tracker: INotebookTracker;
}

/**
 * Initialization data for the jupyterlab-execute-time extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_NAME,
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    settingRegistry: ISettingRegistry
  ) => {
    let settings: ISettingRegistry.ISettings;
    try {
      settings = await settingRegistry.load(`${PLUGIN_NAME}:settings`);
    } catch (err: unknown) {
      console.error(
        `jupyterlab-execute-time: Could not load settings, so did not active ${PLUGIN_NAME}: ${err}`
      );
      return;
    }

    // If the plugin is enabled, force recording of timing
    // We only do this once (not on every settings update) in case the user tries to turn it off
    if (settings.get('enabled').composite) {
      settingRegistry.load('@jupyterlab/notebook-extension:tracker').then(
        (nbSettings: ISettingRegistry.ISettings) =>
          nbSettings.set('recordTiming', true),
        (err: Error) => {
          console.error(
            `jupyterlab-execute-time: Could not force metadata recording: ${err}`
          );
        }
      );
    }

    app.docRegistry.addWidgetExtension(
      'Notebook',
      new ExecuteTimeWidgetExtension(tracker, settings)
    );

    // eslint-disable-next-line no-console
    console.log('JupyterLab extension jupyterlab-execute-time is activated!');
  },
};

export default extension;
