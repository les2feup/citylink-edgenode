import { createLogger } from "common/log";
import type { ControllerState } from "./types/states.ts";

export class ControllerFSM {
  #transitions: Record<ControllerState, ControllerState[]>;
  #state: ControllerState = "Unknown";
  #logger: ReturnType<typeof createLogger>;

  constructor(
    transitions: Record<ControllerState, ControllerState[]>,
    loggerContext?: Record<string, unknown>,
  ) {
    this.#transitions = transitions;
    this.#logger = createLogger("uMQTT-Core-Controller", "FSM", loggerContext);
    this.#logger.info(`Initial state: ${this.#state}`);
  }

  get state(): ControllerState {
    return this.#state;
  }

  canTransition(to: ControllerState): boolean {
    return this.#transitions[this.#state]?.includes(to) ?? false;
  }

  transition(to: ControllerState): void {
    if (this.#state === to) {
      this.#logger.warn(
        { state: to },
        "Attempted to transition to the same state",
      );
      throw new Error("AlreadyInState");
    }

    if (!this.canTransition(to)) {
      this.#logger.error(
        { from: this.#state, to },
        "Invalid transition attempted",
      );
      throw new Error("InvalidTransition");
    }

    this.#logger.info({ from: this.#state, to }, "Transitioning state");
    this.#state = to;
  }

  is(state: ControllerState): boolean {
    return this.#state === state;
  }
}
