import type { AppContentTypes } from "@cityling-edgenode/core";
import { encodeBase64 } from "@std/encoding/base64";
import { createLogger } from "common/log";

const logger = createLogger("core", "ContentEncoding");

export function encodeContentBase64(content: AppContentTypes): string {
  logger.debug(
    { ContentType: typeof content, Content: content },
    "Encoding content to Base64",
  );

  let encoded: string;
  switch (typeof content) {
    case "string":
      encoded = encodeBase64(content);
      break;
    case "object": {
      if (content instanceof Uint8Array) {
        encoded = encodeBase64(content);
        break;
      }
      encoded = encodeBase64(JSON.stringify(content));
      break;
    }
    default:
      throw new Error(
        `Unsupported content type for encoding: ${typeof content}`,
      );
  }

  logger.debug(
    { EncodedContent: encoded },
    "Content encoded to Base64 successfully",
  );

  return encoded;
}
