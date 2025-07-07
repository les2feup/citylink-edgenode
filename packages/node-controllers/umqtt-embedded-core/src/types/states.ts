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
  Application: ["AdaptationPrep", "Unknown"],
  AdaptationPrep: ["Restarting", "Unknown"],
  Adaptation: ["Restarting", "Unknown"],
  Restarting: ["Application", "Adaptation", "Unknown"],
};

export const CoreStatusValues = ["UNDEF", "OTAU", "APP"] as const;
export type CoreStatus = (typeof CoreStatusValues)[number];
