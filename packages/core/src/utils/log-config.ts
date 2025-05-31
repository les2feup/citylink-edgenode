import type { log } from "@utils/log";

//TODO: set level based on environment variable
//Update config for new project format

export const loggers: Record<string, log.LoggerConfig> = {
  "citylink-core": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink-core.edge-connector": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink-core.end-node": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink-core.utils": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink-core.services": {
    level: "DEBUG",
    handlers: ["console"],
  },
};
