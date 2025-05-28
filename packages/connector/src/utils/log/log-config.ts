import type * as log from "jsr:@std/log";

export const loggers: Record<string, log.LoggerConfig> = {
  "citylink": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.connectors": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.connectors.mqtt": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.connectors.mqtt.registration": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.controllers": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.controllers.umqttCore": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.services": {
    level: "DEBUG",
    handlers: ["console"],
  },
  "citylink.services.cache": {
    level: "DEBUG",
    handlers: ["console"],
  },
};
