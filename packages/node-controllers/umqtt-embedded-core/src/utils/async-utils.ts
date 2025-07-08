export type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (v: T) => void;
  readonly reject: (e?: unknown) => void;
  readonly isSettled?: boolean;
};

export function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  let isSettled = false;
  promise.finally(() => {
    isSettled = true;
  });

  return { promise, resolve, reject, isSettled };
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
    .catch((err) => {
      onError(
        new Error(
          `Error settling promises: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    });
}
