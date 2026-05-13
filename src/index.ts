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
    const pluginId = `${PLUGIN_NAME}:settings`;

    // Populate the `timezone` dropdown with the IANA timezones the host
    // runtime supports. Done as a `fetch` transform so the choices are
    // baked into the schema before the settings UI renders it. Note that
    // we intentionally only add `oneOf` here (not in the static schema);
    // the server validates writes against the static schema, so leaving
    // it as just `type: "string"` accepts any IANA name on save.
    settingRegistry.transform(pluginId, {
      fetch: plugin => {
        // `Intl.supportedValuesOf` lives in lib.es2022.intl; cast narrowly
        // instead of bumping the project-wide tsconfig.
        const supportedValuesOf = (
          Intl as { supportedValuesOf?: (key: 'timeZone') => string[] }
        ).supportedValuesOf;
        // Always include UTC: some ICU builds omit it from the canonical
        // list (returning only `Etc/UTC`), which would prevent the most
        // common choice from appearing in the dropdown.
        const zones = Array.from(
          new Set([
            'UTC',
            ...(supportedValuesOf ? supportedValuesOf('timeZone') : []),
          ])
        ).sort();
        const properties = plugin.schema.properties ?? {};
        properties.timezone = {
          ...properties.timezone,
          oneOf: [
            { type: 'string', const: '', title: 'Browser local time' },
            ...zones.map(zone => ({
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
