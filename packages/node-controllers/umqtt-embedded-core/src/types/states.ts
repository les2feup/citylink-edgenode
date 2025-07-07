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
  Unknown: ["Application", "AdaptationPrep", "Adaptation"],
  Application: ["AdaptationPrep", "Adaptation", "Unknown"],
  AdaptationPrep: ["Restarting", "Unknown"],
  Adaptation: ["Restarting", "Application", "Unknown"],
  Restarting: ["Application", "Adaptation", "Unknown"],
};

export const CoreStatusValues = ["UNDEF", "ADAPT", "APP"] as const;
export type CoreStatus = (typeof CoreStatusValues)[number];
