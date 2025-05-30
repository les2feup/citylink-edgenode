import { z } from "zod";

export const RegistrationSchema = z.object({
  manifest: z.string().url(),
  tmOnly: z.boolean().optional().default(false),
});
export type RegistrationSchema = z.infer<typeof RegistrationSchema>;
