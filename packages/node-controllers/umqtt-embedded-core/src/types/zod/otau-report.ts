import { z } from "zod";

export const OTAUDeleteResult = z.object({
  error: z.literal(false),
  deleted: z.array(z.string()),
});

export const OTAUWriteResult = z.object({
  error: z.literal(false),
  written: z.string(),
});

export const OTAUErrorResult = z.object({
  error: z.literal(true),
  message: z.string(),
});

export const OTAUReport = z.object({
  timestamp: z.object({
    epoch_year: z.number().optional(),
    seconds: z.number(),
  }),
  result: z.union([
    OTAUDeleteResult,
    OTAUWriteResult,
    OTAUErrorResult,
  ]),
});

export type OTAUDeleteResult = z.infer<typeof OTAUDeleteResult>;
export type OTAUWriteResult = z.infer<typeof OTAUWriteResult>;
export type OTAUErrorResult = z.infer<typeof OTAUErrorResult>;
export type OTAUReport = z.infer<typeof OTAUReport>;
