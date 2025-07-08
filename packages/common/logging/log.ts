import { pino } from "npm:pino";
import pretty from "npm:pino-pretty";

const env = Deno.env.get("NODE_ENV") ??
    Deno.env.get("DENO_ENV") ??
    Deno.env.get("CITYLINK_ENV") ?? "development";

const isDev = env === "development" || env === "test";
const logLevel = Deno.env.get("CITYLINK_LOG") || (isDev ? "debug" : "warn");

const stream = isDev
    ? pretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname,package,module",
        messageFormat: "CityLink:{package}:{module} {msg}",
    })
    : undefined;

export const logger = pino(
    {
        level: logLevel,
    },
    stream,
);

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(
    packageName: string,
    moduleName: string,
    context?: Record<string, unknown>,
) {
    return logger.child({
        package: packageName,
        module: moduleName,
        ...context,
    });
}
