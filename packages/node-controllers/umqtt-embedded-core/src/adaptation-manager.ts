import type { SourceFile } from "@citylink-edgenode/core";
import { encodeContentBase64 } from "./utils/content-encoding.ts";
import { crc32 } from "node:zlib";
import { createLogger } from "common/log";

export type AdaptationHandlers = {
  adaptationInit(tmURL?: URL): Promise<void>;
  adaptationWrite(file: SourceFile): Promise<string>;
  adaptationDelete(path: string, recursive: boolean): Promise<string[]>;
  adaptationCommit(): Promise<void>;
  adaptationRollback(): Promise<void>;
};

export type AdaptationResult = {
  written: string[];
  deleted: string[];
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
  #handlers: AdaptationHandlers;

  constructor(
    handlers: AdaptationHandlers,
    loggerContext?: Record<string, unknown>,
  ) {
    this.#handlers = handlers;
    this.#logger = createLogger(
      "uMQTT-Core-Controller",
      "AdaptationManager",
      loggerContext,
    );
  }

  get adaptationSet(): Set<string> {
    return this.#replaceSet;
  }

  async adapt(source: SourceFile[], tmURL?: URL): Promise<void> {
    const [valid, errorMsg] = this.validateSource(source);
    if (!valid) throw new Error(errorMsg!);

    try {
      this.#logger.info(
        { files: source.map((f) => f.path) },
        "🔄 Starting adaptation...",
      );

      await this.#handlers.adaptationInit(tmURL);
      await this.deleteOldFiles(source);
      await this.writeNewFiles(source);
      await this.#handlers.adaptationCommit();
      this.#logger.info("✅ Adaptation completed successfully.");
    } catch (error) {
      this.#logger.error({ error }, "❌ Adaptation failed, rolling back...");

      try {
        await this.#handlers.adaptationRollback();
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

  validateSource(source: SourceFile[]): [boolean, string?] {
    const hasMain = source.some((f) =>
      f.path === "main.py" || f.path === "main.mpy"
    );
    return hasMain
      ? [true]
      : [false, "❗️ Source must include 'main.py' or 'main.mpy'."];
  }

  private async deleteOldFiles(source: SourceFile[]) {
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
      await this.#handlers.adaptationDelete(path, false);
    }
  }

  private async writeNewFiles(source: SourceFile[]) {
    this.#logger.info(
      { files: source.map((f) => f.path) },
      "📥 Writing source files...",
    );

    for (const file of source) {
      const written = await this.#handlers.adaptationWrite(file);

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
