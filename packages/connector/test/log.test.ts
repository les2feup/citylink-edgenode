import type * as log from "jsr:@std/log";
import { assertEquals } from "jsr:@std/assert";
import { getLoggerName } from "../src/utils/log/internal/internal.ts";

Deno.test("getLoggerName returns default logger for unknown module", () => {
  const config: log.LogConfig = {
    loggers: {
      default: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  };
  const loggerName = getLoggerName("file:///unknown/module.ts", config);
  assertEquals(loggerName, "default");
});

Deno.test("getLoggerName returns correct logger for known module", () => {
  const moduleUrl = `file://${Deno.cwd()}/src/controllers/exampleController.ts`;
  const config: log.LogConfig = {
    loggers: {
      "citylink.controllers.exampleController": {
        level: "INFO",
        handlers: ["console"],
      },
      default: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  };
  const loggerName = getLoggerName(moduleUrl, config);
  assertEquals(loggerName, "citylink.controllers.exampleController");
});

Deno.test("getLoggerName return the closest matching logger", () => {
  const moduleUrl =
    `file://${Deno.cwd()}/src/controllers/nested/exampleController.ts`;

  const moduleUrl2 =
    `file://${Deno.cwd()}/src/controllers/nested/somethingElse.ts`;

  const config: log.LogConfig = {
    loggers: {
      "citylink.controllers.nested.exampleController": {
        level: "INFO",
        handlers: ["console"],
      },
      "citylink.controllers.nested": {
        level: "DEBUG",
        handlers: ["console"],
      },
      default: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  };
  const loggerName = getLoggerName(moduleUrl, config);
  assertEquals(
    loggerName,
    "citylink.controllers.nested.exampleController",
  );

  const loggerName2 = getLoggerName(moduleUrl2, config);
  assertEquals(loggerName2, "citylink.controllers.nested");
});
