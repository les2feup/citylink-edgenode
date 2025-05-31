import type * as log from "@utils/log";

//TODO: set level based on environment variable
//Update config for new project format

export const loggers: Record<string, log.LoggerConfig> = {
  "citylink": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.edge-connector": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.end-node": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.utils": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.services": {
    level: "DEBUG",
    handlers: ["console"],
  },
};
