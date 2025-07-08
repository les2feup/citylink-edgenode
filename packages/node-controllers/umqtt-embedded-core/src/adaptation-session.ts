import type { ControllerFSM } from "./fsm.ts";
import { defer, type Deferred } from "./utils/async-utils.ts";
import type { Logger } from "common/log";

type AsyncCallback = () => Promise<void>;
type Callback = () => void;

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
    initTimeout: 5000,
    writeTimeout: 5000,
    deleteTimeout: 5000,
    commitTimeout: 5000,
    rollbackTimeout: 5000,
  };

  // deno-lint-ignore no-explicit-any
  #promises: Record<PromiseType, Deferred<any>> = {
    init: defer<void>(),
    write: defer<string>(),
    delete: defer<string[]>(),
    commit: defer<void>(),
    rollback: defer<void>(),
  };

  #fsm: ControllerFSM;
  #logger: Logger;
  #timeoutConfig: Record<string, number>;
  #isAborted = false;

  constructor(
    fsm: ControllerFSM,
    logger: Logger,
    timeoutConfig?: Partial<typeof AdaptationSession.DEFAULT_TIMEOUTS>,
  ) {
    this.#fsm = fsm;
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
    const error = new Error(reason);
    this.#logger.error({ reason, error }, "❌ Aborting adaptation session");

    for (const promise of Object.values(this.#promises)) {
      if (!promise.isSettled) {
        promise.reject(error);
      }
    }

    this.#isAborted = true;
  }

  #withStateTimeout<T>(
    promise: Promise<T>,
    context: string,
    timeoutMs: number,
    timeoutCB?: Callback,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          this.#logger.error({ context }, `⏱️ Timeout during ${context}`);
          timeoutCB?.();
          reject(new Error(`Timeout in ${context}`));
        }, timeoutMs);
      }),
    ]);
  }

  #assertAdaptationState(op: string): void {
    if (!this.#fsm.is("Adaptation")) {
      this.#logger.error(
        { operation: op, state: this.#fsm.state },
        "⚠️ Cannot perform adaptation operation outside of Adaptation state",
      );
      throw new Error("InvalidState: Not in Adaptation state");
    }
  }

  async #performWithTimeout<T>(
    action: AsyncCallback,
    kind: PromiseType,
    context: string,
    timeout: number,
    timeoutCB?: Callback,
    createNew?: boolean,
  ): Promise<T> {
    if (this.#isAborted) {
      this.#logger.warn(
        { promise: kind, context },
        "🔄 Attempted action on aborted session",
      );
      throw new Error("Adaptation session aborted");
    }

    const deferred = this.#promises[kind];
    if (deferred.isSettled) {
      if (createNew) this.#promises[kind] = defer();
      else throw new Error("Promise already settled");
    }

    await action();
    return await this.#withStateTimeout(
      this.#promises[kind].promise,
      context,
      timeout,
      timeoutCB,
    );
  }

  async init(
    initAction: AsyncCallback,
    timeoutCB?: Callback,
  ): Promise<void> {
    if (this.#fsm.is("Adaptation")) {
      this.#logger.warn("🔄 Node already in Adaptation state, skipping init.");
      return;
    }

    if (!this.#fsm.is("AdaptationPrep")) {
      this.#logger.error(
        {
          state: this.#fsm.state,
          expectedState: "AdaptationPrep",
        },
        "❌ Invalid state for adaptation initialization",
      );
      throw new Error(
        "Adaptation session not in correct state for initialization.",
      );
    }

    return await this.#performWithTimeout(
      initAction,
      "init",
      "adaptationInit",
      this.#timeoutConfig.initTimeout,
      timeoutCB,
    );
  }

  async write(
    writeAction: AsyncCallback,
    timeoutCB?: Callback,
  ): Promise<string> {
    this.#assertAdaptationState("write");
    return await this.#performWithTimeout(
      writeAction,
      "write",
      "adaptationWrite",
      this.#timeoutConfig.writeTimeout,
      timeoutCB,
      true, // Allow creating a new promise if already settled
    );
  }

  async delete(
    deleteAction: AsyncCallback,
    timeoutCB?: Callback,
  ): Promise<string[]> {
    this.#assertAdaptationState("delete");
    return await this.#performWithTimeout(
      deleteAction,
      "delete",
      "adaptationDelete",
      this.#timeoutConfig.deleteTimeout,
      timeoutCB,
      true, // Allow creating a new promise if already settled
    );
  }

  async commit(
    commitAction: AsyncCallback,
    timeoutCB?: Callback,
  ): Promise<void> {
    this.#assertAdaptationState("commit");
    return await this.#performWithTimeout(
      commitAction,
      "commit",
      "adaptationCommit",
      this.#timeoutConfig.commitTimeout,
      timeoutCB,
    );
  }

  async rollback(
    rollbackAction: AsyncCallback,
    timeoutCB?: Callback,
  ): Promise<void> {
    this.#assertAdaptationState("rollback");
    return await this.#performWithTimeout(
      rollbackAction,
      "rollback",
      "adaptationRollback",
      this.#timeoutConfig.rollbackTimeout,
      timeoutCB,
    );
  }
}
