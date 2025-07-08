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
    this.#logger.error({ reason }, "❌ Aborting adaptation session");

    for (const p of Object.values(this.#promises)) {
      if (!p.isSettled) {
        p.reject("Adaptation aborted");
        p.promise.catch((err) => {
          this.#logger.debug({ err }, "Promise rejected due to session abort");
        });
      }
    }

    this.#isAborted = true;
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

  async init(initAction: AsyncCallback): Promise<void> {
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
      this.#timeoutConfig.initTimeout,
    );
  }

  async write(writeAction: AsyncCallback): Promise<string> {
    this.#assertAdaptationState("write");
    return await this.#performWithTimeout(
      writeAction,
      "write",
      this.#timeoutConfig.writeTimeout,
      true, // Allow creating a new promise if already settled
    );
  }

  async delete(deleteAction: AsyncCallback): Promise<string[]> {
    this.#assertAdaptationState("delete");
    return await this.#performWithTimeout(
      deleteAction,
      "delete",
      this.#timeoutConfig.deleteTimeout,
      true, // Allow creating a new promise if already settled
    );
  }

  async commit(commitAction: AsyncCallback): Promise<void> {
    this.#assertAdaptationState("commit");
    return await this.#performWithTimeout(
      commitAction,
      "commit",
      this.#timeoutConfig.commitTimeout,
    );
  }

  async rollback(rollbackAction: AsyncCallback): Promise<void> {
    this.#assertAdaptationState("rollback");
    return await this.#performWithTimeout(
      rollbackAction,
      "rollback",
      this.#timeoutConfig.rollbackTimeout,
    );
  }
}
