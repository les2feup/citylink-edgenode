import type { AppContentTypes } from "@citylink-edgc/core";
import { encodeBase64 } from "@std/encoding/base64";

export function encodeContentBase64(content: AppContentTypes): string {
  switch (typeof content) {
    case "string":
      return encodeBase64(content);
    case "object": {
      if (content instanceof Uint8Array) {
        return encodeBase64(content);
      }
      return encodeBase64(JSON.stringify(content));
    }
  }
}
