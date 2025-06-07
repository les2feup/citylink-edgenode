import { z } from "zod";

export const RegistrationSchema = z.object({
  tm: z.string().url(),
  placeholder: z.record(z.string(), z.any()).optional(),
});
export type RegistrationSchema = z.infer<typeof RegistrationSchema>;
