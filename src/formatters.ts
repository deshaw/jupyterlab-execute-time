import { differenceInMilliseconds, format } from 'date-fns';

/**
 * Checks if a given date format string is valid.
 *
 * This function checks if the input date format string contains only valid characters.
 * Valid characters include: y, G, u, q, Q, M, L, w, d, e, E, c, a, b, B, h, H, k, K, m, s, S, z, O, x, X.
 * Valid characters are based on [date-fns unicode format](https://date-fns.org/v2.30.0/docs/format).
 *
 * @param {string} dateFormat - The date format string to validate.
 * @returns {boolean} Returns true if the format is valid.
 * @throws {Error} Throws an error if the format contains invalid characters.
 */
export const isValidDateFormat = (dateFormat: string) => {
  const validChars = 'yGuqQMLwdeEcabBhHkKmsSzOxX';

  const invalidChars = Array.from(dateFormat).filter(
    (char) => !validChars.includes(char)
  );

  if (invalidChars.length > 0) {
    throw new Error(
      `Invalid characters in date format: ${invalidChars.join(
        ', '
      )} . see https://date-fns.org/docs/format for valid characters`
    );
  }

  return true; // The format is valid.
};

export const getTimeString = (
  date: Date,
  dateFormat = 'yyy-MM-dd HH:mm:ss'
): string => {
  try {
    // Check if the dateFormat is valid before formatting
    isValidDateFormat(dateFormat);

    return format(date, dateFormat);
  } catch (error) {
    if (error instanceof RangeError) {
      console.error(error.message);
    } else {
      throw error; // Re-throw other errors for further handling
    }
  }
};

export const getTimeDiff = (end: Date, start: Date): string => {
  // Human format based on loosely on ideas from:
  // https://github.com/ipython-contrib/jupyter_contrib_nbextensions/blob/master/src/jupyter_contrib_nbextensions/nbextensions/execute_time/ExecuteTime.js#L194
  const MS_IN_SEC = 1000;
  const MS_IN_MIN = 60 * MS_IN_SEC;
  const MS_IN_HR = 60 * MS_IN_MIN;
  const MS_IN_DAY = 24 * MS_IN_HR;

  let ms = differenceInMilliseconds(end, start);
  if (ms < MS_IN_SEC) {
    return `${ms}ms`;
  }
  const days = Math.floor(ms / MS_IN_DAY);
  ms = ms % MS_IN_DAY;

  const hours = Math.floor(ms / MS_IN_HR);
  ms = ms % MS_IN_HR;

  const mins = Math.floor(ms / MS_IN_MIN);
  ms = ms % MS_IN_MIN;

  // We want to show this as fractional
  const secs = ms / MS_IN_SEC;

  let timeDiff = '';
  if (days) {
    timeDiff += `${days}d `;
  }
  if (days || hours) {
    timeDiff += `${hours}h `;
  }
  if (days || hours || mins) {
    timeDiff += `${mins}m `;
  }
  // Only show s if its < 1 day
  if (!days) {
    // Only show ms if is < 1 hr
    timeDiff += `${secs.toFixed(hours ? 0 : 2)}s`;
  }
  return timeDiff.trim();
};
