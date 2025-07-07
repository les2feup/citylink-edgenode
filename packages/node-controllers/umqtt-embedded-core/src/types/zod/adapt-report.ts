import { z } from "zod";

export const AdaptWriteResult = z.object({
  error: z.literal(false).optional(),
  written: z.string(),
  deleted: z.never().optional(), // to prevent overlap
});

export const AdaptDeleteResult = z.object({
  error: z.literal(false).optional(),
  deleted: z.array(z.string()),
  written: z.never().optional(),
});

export const AdaptErrorResult = z.object({
  error: z.literal(true),
  message: z.string(),
});

export const AdaptResult = z.union([
  AdaptDeleteResult,
  AdaptWriteResult,
  AdaptErrorResult,
]);

export const AdaptReport = z.object({
  timestamp: z.object({
    epoch_year: z.number().optional().default(1970),
    seconds: z.number(),
  }),
  result: AdaptResult,
});

export type AdaptDeleteResult = z.infer<typeof AdaptDeleteResult>;
export type AdaptWriteResult = z.infer<typeof AdaptWriteResult>;
export type AdaptErrorResult = z.infer<typeof AdaptErrorResult>;
export type AdaptResult = z.infer<typeof AdaptResult>;
export type AdaptReport = z.infer<typeof AdaptReport>;
