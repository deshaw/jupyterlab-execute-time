import { Page, ElementHandle } from 'playwright';
import * as path from 'path';

/**
 * Upload and open given notebook.
 */
export function openNotebook(fileName: string) {
  return async ({ page, tmpPath }) => {
    await page.contents.uploadFile(
      path.resolve(__dirname, `../notebooks/${fileName}`),
      `${tmpPath}/${fileName}`
    );
    await page.notebook.openByPath(`${tmpPath}/${fileName}`);
    await page.notebook.activate(fileName);
  };
}

/**
 * Clean the temporary directory.
 */
export async function cleanup({ page, tmpPath }) {
  await page.contents.deleteDirectory(tmpPath);
}

/**
 * Accept the dialog which has the given title.
 */
export async function acceptDialog(page: Page, title: string) {
  const dialog = await page.waitForSelector(`.jp-Dialog:has-text("${title}")`);
  const button = await dialog.waitForSelector(
    '.jp-Dialog-button.jp-mod-accept'
  );
  await button.click();
  await dialog.waitForElementState('hidden');
}

/**
 * Take a screenshot masking digits in the execute-time widget.
 * The node will be temporarily cloned to allow taking a masked
 * snapshot while the live execution timer is kicking.
 */
export async function maskedScreenshot(
  widget: ElementHandle<HTMLElement | SVGElement>
) {
  // Clone the widget node and mask the digits.
  const masked = (await widget.evaluateHandle(async (original) => {
    console.log((original as HTMLElement).innerText);
    const node = original.cloneNode(true) as HTMLElement;
    node.querySelectorAll('span').forEach((span) => {
      span.innerText = span.innerText.replace(/[0-9]/g, 'X');
    });
    // Fix width to avoid jitter
    node.style.width = '500px';
    // Make sure the copy is visible
    node.style.zIndex = '1000';
    node.style.position = 'absolute';
    document.body.appendChild(node);
    node.id = 'clone';
    return node;
  })) as ElementHandle<HTMLElement>;
  const blob = await masked.screenshot({ timeout: 1000 });
  // Clean up
  await masked.evaluateHandle((node) => {
    document.body.removeChild(node);
  });
  return blob;
}
