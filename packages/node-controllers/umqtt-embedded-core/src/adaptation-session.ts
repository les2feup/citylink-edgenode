import type { ControllerFSM } from "./fsm.ts";
import { defer, type Deferred } from "./utils/async-utils.ts";
import type { Logger } from "common/log";

const promiseTypes = [
  "init",
  "write",
  "delete",
  "commit",
  "rollback",
] as const;
export type PromiseType = (typeof promiseTypes)[number];

export class AdaptationSession {
  static readonly DEFAULT_TIMEOUTS = {
    initTimeout: 60000,
    writeTimeout: 60000,
    deleteTimeout: 60000,
    commitTimeout: 60000,
    rollbackTimeout: 60000,
  };

  // deno-lint-ignore no-explicit-any
  #promises: Record<PromiseType, Deferred<any>> = {
    init: defer<void>(),
    write: defer<string>(),
    delete: defer<string[]>(),
    commit: defer<void>(),
    rollback: defer<void>(),
  };

  #logger: Logger;
  #timeoutConfig: Record<string, number>;
  #isAborted = false;
  #isFinished = false;
  #commitIssued = false;
  #rollbackIssued = false;

  constructor(
    logger: Logger,
    timeoutConfig?: Partial<typeof AdaptationSession.DEFAULT_TIMEOUTS>,
  ) {
    this.#logger = logger.child({ name: "AdaptationSession" });
    this.#timeoutConfig = {
      ...AdaptationSession.DEFAULT_TIMEOUTS,
      ...timeoutConfig,
    };
  }

  resolve(kind: PromiseType, data?: unknown): boolean {
    if (this.#isAborted) {
      this.#logger.warn(
        { promise: kind, data },
        "🔄 Attempted resolve on aborted session",
      );
      return false;
    }

    const deferred = this.#promises[kind];
    if (deferred.isSettled) {
      this.#logger.warn(
        { promise: kind },
        "🔄 Attempted resolve on already settled promise",
      );
      return true;
    }

    switch (kind) {
      case "init":
      case "commit":
      case "rollback":
        deferred.resolve(undefined);
        return true;
      case "write":
        if (typeof data === "string") {
          deferred.resolve(data);
          return true;
        }
        break;
      case "delete":
        if (
          Array.isArray(data) && data.every((item) => typeof item === "string")
        ) {
          deferred.resolve(data);
          return true;
        }
        break;
    }

    this.#logger.warn(
      { promise: kind, data },
      "🔄 Attempted resolve with invalid data",
    );
    return false;
  }

  reject(kind: PromiseType, reason: string): boolean {
    if (this.#isAborted) {
      this.#logger.warn(
        { promise: kind, reason },
        "🔄 Attempted reject on aborted session",
      );
      return false;
    }

    const deferred = this.#promises[kind];
    if (deferred.isSettled) {
      this.#logger.warn(
        { promise: kind },
        "🔄 Attempted reject on already settled promise",
      );
      return false;
    }

    deferred.reject(reason);
    return true;
  }

  abort(reason: string): void {
    this.#logger.error({ reason }, "❌ Aborting adaptation session");

    for (const p of Object.values(this.#promises)) {
      if (!p.isSettled) {
        p.reject("Adaptation aborted");
        p.promise.catch((err) => this.#logger.debug({ err }));
      }
    }

    this.#isAborted = true;
  }

  finish(): boolean {
    if (this.#isAborted) {
      this.#logger.warn("🔄 Adaptation session already aborted.");
      return false;
    }

    if (this.#isFinished) {
      this.#logger.warn("🔄 Adaptation session already completed.");
      return true;
    }

    this.#isFinished = (() => {
      if (this.#commitIssued) return this.resolve("commit");
      if (this.#rollbackIssued) return this.resolve("rollback");
      return false;
    })();

    return this.#isFinished;
  }

  async init(initAction: () => Promise<void>): Promise<void> {
    return await this.#performWithTimeout(
      initAction,
      "init",
      this.#timeoutConfig.initTimeout,
    );
  }

  async write(writeAction: () => Promise<void>): Promise<string> {
    return await this.#performWithTimeout(
      writeAction,
      "write",
      this.#timeoutConfig.writeTimeout,
      true, // Allow creating a new promise if already settled
    );
  }

  async delete(deleteAction: () => Promise<void>): Promise<string[]> {
    return await this.#performWithTimeout(
      deleteAction,
      "delete",
      this.#timeoutConfig.deleteTimeout,
      true, // Allow creating a new promise if already settled
    );
  }

  async commit(commitAction: () => Promise<void>): Promise<void> {
    await this.#performWithTimeout(
      commitAction,
      "commit",
      this.#timeoutConfig.commitTimeout,
    );
    this.#commitIssued = true;
  }

  async rollback(rollbackAction: () => Promise<void>): Promise<void> {
    await this.#performWithTimeout(
      rollbackAction,
      "rollback",
      this.#timeoutConfig.rollbackTimeout,
    );
    this.#rollbackIssued = true;
  }

  async #performWithTimeout<T>(
    action: () => Promise<void>,
    kind: PromiseType,
    timeout: number,
    createNew?: boolean,
  ): Promise<T> {
    if (this.#isAborted) {
      this.#logger.warn(
        { promise: kind },
        "🔄 Attempted action on aborted session",
      );
      throw new Error("Adaptation session aborted");
    }

    if (this.#promises[kind].isSettled) {
      if (createNew) this.#promises[kind] = defer();
      else throw new Error("Promise already settled");
    }

    await action();

    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => reject(`Adaptation ${kind} timeout`), timeout);
    });

    const p = this.#promises[kind].promise;
    return Promise.race([p, timeoutPromise]);
  }
}
