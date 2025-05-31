import type { AppContentTypes } from "./zod/app-manifest.ts";

export type SourceFile = {
  path: string;
  url: string;
  content: AppContentTypes;
};

export type AppFetchError = {
  url: string;
  error: Error;
};

export type AppFetchResult = SourceFile | AppFetchError;
