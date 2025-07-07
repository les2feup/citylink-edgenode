import type { createLogger } from "common/log";

export function defer<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function settleAllPromises<T>(
  promises: Promise<T>[],
  onSuccess: (results: T[]) => void,
  onError: (error: Error) => void,
) {
  Promise.allSettled(promises)
    .then((results) => {
      const fulfilled: T[] = [];
      const errors: unknown[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          fulfilled.push(result.value);
        } else {
          errors.push(result.reason);
        }
      }

      if (fulfilled.length > 0) {
        onSuccess(fulfilled);
      }

      if (errors.length > 0) {
        const message = errors
          .map((err) => (err instanceof Error ? err.message : String(err)))
          .join(", ");
        onError(new Error(message));
      }
    })
    .catch(onError);
}

export function makePromiseTask(
  promises: Promise<void>[],
  successMsg: string,
  errorMsg: string,
  logger: ReturnType<typeof createLogger>,
): {
  promises: Promise<void>[];
  onSuccess: () => void;
  onError: (err: Error) => void;
} {
  return {
    promises,
    onSuccess: () => logger.info(successMsg),
    onError: (err: Error) => logger.error({ err }, errorMsg),
  };
}
