import type { SourceFile } from "@citylink-edgenode/core";
import { encodeContentBase64 } from "./utils/content-encoding.ts";
import { crc32 } from "node:zlib";
import { createLogger } from "common/log";
import type { ControllerFSM } from "./fsm.ts";
import { AdaptationSession } from "./adaptation-session.ts";

export type AdaptationActionHandlers = {
  initAction(tmURL?: URL): Promise<void>;
  writeAction(file: SourceFile): Promise<void>;
  deleteAction(path: string, recursive: boolean): Promise<void>;
  commitAction(): Promise<void>;
  rollbackAction(): Promise<void>;
};

export class AdaptationManager {
  static readonly #coreDirs = ["citylink", "citylink/ext", "config"];
  static readonly #replaceIgnore = [
    "main.py",
    "main.mpy",
    "citylink/core.py",
    "citylink/core.mpy",
    "config/config.json",
  ];
  #logger: ReturnType<typeof createLogger>;
  #replaceSet = new Set<string>();
  #handlers: AdaptationActionHandlers;
  #fsm: ControllerFSM;
  #session?: AdaptationSession;
  #timeoutConfig?: Partial<typeof AdaptationSession.DEFAULT_TIMEOUTS>;
  #timeoutCallback = () => {
    this.#fsm.transition("Unknown");
  };

  constructor(
    fsm: ControllerFSM,
    handlers: AdaptationActionHandlers,
    loggerContext?: Record<string, unknown>,
    timeoutConfig?: Partial<typeof AdaptationSession.DEFAULT_TIMEOUTS>,
  ) {
    this.#fsm = fsm;
    this.#handlers = handlers;
    this.#timeoutConfig = timeoutConfig;
    this.#logger = createLogger(
      "uMQTT-Core-Controller",
      "AdaptationManager",
      loggerContext,
    );
  }

  get session(): Readonly<AdaptationSession> | undefined {
    return this.#session;
  }

  abortSession(reason: string): void {
    if (!this.#session) {
      this.#logger.warn("❗️ No active adaptation session to abort.");
      return;
    }

    this.#logger.info(
      { reason: reason ?? "No reason provided" },
      "🔄 Aborting current adaptation session...",
    );
    this.#session.abort(reason);
    this.#session = undefined;
  }

  async adapt(
    source: SourceFile[],
    tmURL?: URL,
    abortPrevious?: boolean,
    abortReason?: string,
  ): Promise<void> {
    const [valid, errorMsg] = this.validateSource(source);
    if (!valid) throw new Error(errorMsg!);

    if (this.#session) {
      if (abortPrevious) {
        this.#logger.warn(
          "🔄 Aborting previous adaptation session before starting a new one.",
        );
        this.#session.abort(abortReason ?? "Forcing new adaptation session.");
      } else {
        throw new Error("❗️ An adaptation session is already in progress.");
      }
    }

    this.#session = new AdaptationSession(
      this.#fsm,
      this.#logger,
      this.#timeoutConfig,
    );

    try {
      this.#logger.info(
        { files: source.map((f) => f.path) },
        "🔄 Starting adaptation...",
      );
      await this.#performAdaptation(source, tmURL);
      this.#logger.info("✅ Adaptation completed successfully.");
    } catch (error) {
      this.#logger.error({ error }, "❌ Adaptation failed, rolling back...");

      try {
        await this.#session!.rollback(
          () => this.#handlers.rollbackAction(),
          this.#timeoutCallback,
        );
      } catch (rollbackError) {
        this.#logger.error(
          { rollbackError },
          "⚠️ Rollback failed after adaptation failure.",
        );
      }

      throw new Error(
        `Adaptation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async #performAdaptation(
    source: SourceFile[],
    tmURL?: URL,
  ): Promise<void> {
    const session = this.#session!;

    await session.init(
      () => this.#handlers.initAction(tmURL!),
      this.#timeoutCallback,
    );

    await this.#deleteOldFiles(source);
    await this.writeNewFiles(source);

    await session.commit(
      () => this.#handlers.commitAction(),
      this.#timeoutCallback,
    );
  }

  validateSource(source: SourceFile[]): [boolean, string?] {
    const hasMain = source.some((f) =>
      f.path === "main.py" || f.path === "main.mpy"
    );
    return hasMain
      ? [true]
      : [false, "❗️ Source must include 'main.py' or 'main.mpy'."];
  }

  async #deleteOldFiles(source: SourceFile[]) {
    const newPaths = new Set(source.map((f) => f.path));
    const toDelete = new Set<string>([...this.#replaceSet]).difference(
      newPaths,
    );
    if (!toDelete.size) return;

    this.#logger.info(
      { toDelete: [...toDelete] },
      "📤 Deleting outdated files...",
    );
    for (const path of toDelete) {
      await this.#session!.delete(
        () => this.#handlers.deleteAction(path, false),
        this.#timeoutCallback,
      );
    }
  }

  private async writeNewFiles(source: SourceFile[]) {
    this.#logger.info(
      { files: source.map((f) => f.path) },
      "📥 Writing source files...",
    );

    for (const file of source) {
      const written = await this.#session!.write(
        () => this.#handlers.writeAction(file),
        this.#timeoutCallback,
      );

      if (written !== file.path) {
        this.#logger.warn(
          { expected: file.path, actual: written },
          "⚠️ Mismatched write path",
        );
        throw new Error("Write failed: mismatched path");
      }

      if (!AdaptationManager.#replaceIgnore.includes(file.path)) {
        this.#replaceSet.add(file.path);
      }
    }
  }

  static makeWriteInput(file: SourceFile) {
    const data = encodeContentBase64(file.content);
    const hash = `0x${(crc32(data) >>> 0).toString(16)}`;
    return {
      path: file.path,
      payload: { data, hash, algo: "crc32" },
      append: false,
    };
  }

  static isCoreDir(path: string): boolean {
    return this.#coreDirs.some((dir) => path.startsWith(dir));
  }
}
