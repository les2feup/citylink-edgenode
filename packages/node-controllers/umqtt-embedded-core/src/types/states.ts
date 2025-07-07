export type ControllerState =
  | "Unknown"
  | "Application"
  | "AdaptationPrep"
  | "Adaptation"
  | "Restarting";

export type ControllerTransitionMap = Record<
  ControllerState,
  ControllerState[]
>;

export const controllerStateTransitions: ControllerTransitionMap = {
  Unknown: ["Application", "AdaptationPrep"],
  Application: ["AdaptationPrep", "Unknown"],
  AdaptationPrep: ["Restarting", "Unknown"],
  Adaptation: ["Restarting", "Unknown"],
  Restarting: ["Application", "Adaptation", "Unknown"],
};
