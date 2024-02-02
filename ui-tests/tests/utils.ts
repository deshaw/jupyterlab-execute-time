import { Page, ElementHandle, Locator } from 'playwright';
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
 * snapshot while the live execution timer is ticking.
 */
export async function maskedScreenshot(
  widget: ElementHandle<HTMLElement | SVGElement>
) {
  // Clone the widget node and mask the digits.
  const masked = (await widget.evaluateHandle(async (original) => {
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
    return node;
  })) as ElementHandle<HTMLElement>;
  const blob = await masked.screenshot({ timeout: 1000 });
  // Clean up
  await masked.evaluateHandle((node) => {
    document.body.removeChild(node);
  });
  return blob;
}

interface ITimeWatchingOptions {
  minimumTicks: number;
  timeout: number;
}

/**
 * Watch updates to the execute time widget of a cell, recording if the updates
 * are monotonically increasing (the return value). The promise will reject if
 * the `timeout` is exceeded, or less than `minimumTicks` updates are seen.
 */
export async function watchTimeIncrease(
  cell: Locator,
  options: ITimeWatchingOptions
): Promise<boolean> {
  return cell.evaluate<Promise<boolean>, ITimeWatchingOptions, HTMLElement>(
    async (cellNode: HTMLElement, options: ITimeWatchingOptions) => {
      let updatesCount = 1;

      const matchTime = (node: HTMLElement, regex: RegExp): number => {
        const result = node.innerText.match(regex);
        if (result === null) {
          return NaN;
        }
        return parseFloat(result[0]);
      };

      const completedPromise = new Promise<boolean>((resolve, reject) => {
        let lastTimeMs = 0;
        const observer = new MutationObserver(() => {
          const node = cellNode.querySelector('.execute-time') as HTMLElement;
          // Stop condition
          if (node.innerText.includes('Last executed')) {
            if (updatesCount >= options.minimumTicks) {
              observer.disconnect();
              return resolve(true);
            } else {
              observer.disconnect();
              return reject(
                `Only ${updatesCount} updates seen, expected at least ${options.minimumTicks}`
              );
            }
          } else {
            // Parse the time
            let milliseconds = matchTime(node, /(\d+)ms ?/);
            const seconds = matchTime(node, /(\d\.\d+)s ?/);
            if (isNaN(milliseconds) && !isNaN(seconds)) {
              milliseconds = seconds * 1000;
            }
            if (isNaN(milliseconds)) {
              observer.disconnect();
              return reject(
                `Could not parse seconds nor milliseconds from ${node.innerText}`
              );
            }
            if (lastTimeMs > milliseconds) {
              observer.disconnect();
              return reject(
                `Non-increasing time delta seen, from ${lastTimeMs}ms to ${milliseconds}ms in ${updatesCount} update`
              );
            }
            lastTimeMs = milliseconds;
          }
          // Only update at the end to ensure we do not increase the counter if the above code errors out
          updatesCount += 1;
        });
        observer.observe(cellNode, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
      const timeoutPromise = new Promise<boolean>((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              `Timeout of ${options.timeout}ms exceeded with ${
                updatesCount - 1
              } updates processed`
            ),
          options.timeout
        )
      );
      return Promise.race([completedPromise, timeoutPromise]);
    },
    options
  );
}
