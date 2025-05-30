import { z } from "zod";

export const RegistrationSchema = z.object({
  manifest: z.string().url(),
  templateMapExtra: z.record(z.string(), z.any()).optional(),
});
export type RegistrationSchema = z.infer<typeof RegistrationSchema>;
