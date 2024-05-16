import { expect, test } from '@jupyterlab/galata';

test.describe('Settings Editor', () => {
  test('Execute Time show up in the Settings Editor', async ({ page }) => {
    await page.evaluate(async () => {
      await window.jupyterapp.commands.execute('settingeditor:open');
    });
    const plugin = page.locator(
      '.jp-PluginList .jp-PluginList-entry >> text="Execute Time"'
    );

    await plugin.waitFor();
    expect(plugin).toHaveCount(1);
  });
});
