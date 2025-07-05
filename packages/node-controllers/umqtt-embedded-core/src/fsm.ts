import { createLogger } from "common/log";
import type { ControllerState, ControllerStateMap } from "./types/states.ts";

export type TransitionError =
  | "InvalidTransition"
  | "AlreadyInState"
  | "CallbackError";

export class ControllerFSM {
  #state: ControllerState = "Idle";
  #stateMap: ControllerStateMap;
  #logger: ReturnType<typeof createLogger>;

  constructor(
    stateMap: ControllerStateMap,
    loggerContext?: Record<string, unknown>,
  ) {
    this.#stateMap = stateMap;
    this.#logger = createLogger("uMQTT-Core-Controller", "FSM", loggerContext);
    this.#logger.info(`Initial state: ${this.#state}`);
  }

  get state(): ControllerState {
    return this.#state;
  }

  canTransition(to: ControllerState): boolean {
    return this.#stateMap[this.#state]?.allowedTransitions.includes(to);
  }

  async transition(to: ControllerState): Promise<void> {
    if (this.#state === to) {
      this.#logger.warn(`Attempted to transition to the same state: ${to}`);
      throw new Error("AlreadyInState");
    }

    if (!this.canTransition(to)) {
      this.#logger.error(
        `Invalid transition from ${this.#state} to ${to}`,
      );
      throw new Error("InvalidTransition");
    }

    this.#logger.info(`Transition from ${this.#state} to ${to}`);
    try {
      await this.#stateMap[this.#state].exitCb?.();
      this.#state = to;
      await this.#stateMap[to].entryCb?.();
    } catch (error) {
      this.#logger.error(
        `Error in exit callback for state ${this.#state}: ${error}`,
      );
      throw new Error("CallbackError");
    }
  }

  is(state: ControllerState): boolean {
    return this.#state === state;
  }

  async execute(): Promise<void> {
    const currentState = this.#stateMap[this.#state];
    if (!currentState) {
      this.#logger.error(`No state data found for state: ${this.#state}`);
      throw new Error("InvalidState");
    }

    this.#logger.info(`Executing state: ${this.#state}`);
    try {
      await currentState.executionCb?.();
    } catch (error) {
      this.#logger.error(
        `Error in execution callback for state ${this.#state}: ${error}`,
      );
      throw new Error("CallbackError");
    }
  }
}
