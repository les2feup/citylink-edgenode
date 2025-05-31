import type { log } from "@utils/log";

//TODO: set level based on environment variable
//Update config for new project format

export const loggers: Record<string, log.LoggerConfig> = {
  "citylink-edgecon-mqtt": {
    level: "DEBUG",
    handlers: ["console"],
  },
};
