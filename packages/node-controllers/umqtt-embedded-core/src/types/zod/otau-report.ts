import { z } from "zod";

export const OTAUWriteResult = z.object({
  error: z.literal(false).optional(),
  written: z.string(),
  deleted: z.never().optional(), // to prevent overlap
});

export const OTAUDeleteResult = z.object({
  error: z.literal(false).optional(),
  deleted: z.array(z.string()),
  written: z.never().optional(),
});

export const OTAUErrorResult = z.object({
  error: z.literal(true),
  message: z.string(),
});

export const OTAUResult = z.union([
  OTAUDeleteResult,
  OTAUWriteResult,
  OTAUErrorResult,
]);

export const OTAUReport = z.object({
  timestamp: z.object({
    epoch_year: z.number().optional().default(1970),
    seconds: z.number(),
  }),
  result: OTAUResult,
});

export type OTAUDeleteResult = z.infer<typeof OTAUDeleteResult>;
export type OTAUWriteResult = z.infer<typeof OTAUWriteResult>;
export type OTAUErrorResult = z.infer<typeof OTAUErrorResult>;
export type OTAUResult = z.infer<typeof OTAUResult>;
export type OTAUReport = z.infer<typeof OTAUReport>;
