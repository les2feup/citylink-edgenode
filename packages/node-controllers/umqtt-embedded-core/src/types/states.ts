export type ControllerState =
  | "Idle"
  | "Application"
  | "AdaptationInit"
  | "AdaptationDelete"
  | "AdaptationWrite"
  | "AdaptationCommit"
  | "AdaptationAbort"
  | "Restarting"
  | "Unknown"
  | "Error";

export type StateData = {
  name: ControllerState;
  allowedTransitions: ControllerState[];
  entryCb?: () => void | Promise<void>;
  exitCb?: () => void | Promise<void>;
  executionCb?: () => void | Promise<void>;
};

export type ControllerStateMap = Record<ControllerState, StateData>;
