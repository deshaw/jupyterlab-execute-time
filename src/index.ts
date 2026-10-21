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
    context: DocumentRegistry.IContext<INotebookModel>,
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
  description: 'Display cell execution timings in JupyterLab notebooks',
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    settingRegistry: ISettingRegistry,
  ) => {
    const pluginId = `${PLUGIN_NAME}:settings`;

    // Inject the list of IANA timezones supported by the runtime into the
    // `timezone` schema's `oneOf` so the settings editor renders it as a
    // dropdown. The static schema only declares `type: "string"` so the
    // server (which validates writes against the static schema) keeps
    // accepting any IANA name; the constrained list lives only in this
    // client-side, fetch-phase transform.
    settingRegistry.transform(pluginId, {
      fetch: (plugin) => {
        // `Intl.supportedValuesOf('timeZone')` is not consistent across JS
        // engines about exposing the bare `UTC` alias (some return only
        // `Etc/UTC`). Prepend it ourselves and dedupe so the most common
        // choice is always selectable.
        const zones = Array.from(
          new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]),
        ).sort();
        const properties = plugin.schema.properties ?? {};
        properties.timezone = {
          ...properties.timezone,
          oneOf: [
            { type: 'string', const: '', title: 'Browser local time' },
            ...zones.map((zone) => ({
              type: 'string',
              const: zone,
              title: zone,
            })),
          ],
        };
        plugin.schema.properties = properties;
        return plugin;
      },
    });

    let settings: ISettingRegistry.ISettings;
    try {
      settings = await settingRegistry.load(pluginId);
    } catch (err: unknown) {
      console.error(
        `jupyterlab-execute-time: Could not load settings, so did not active ${PLUGIN_NAME}: ${err}`,
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
            `jupyterlab-execute-time: Could not force metadata recording: ${err}`,
          );
        },
      );
    }

    app.docRegistry.addWidgetExtension(
      'Notebook',
      new ExecuteTimeWidgetExtension(tracker, settings),
    );

    console.log('JupyterLab extension jupyterlab-execute-time is activated!');
  },
};

export default extension;
