import { z } from "npm:zod";

export const AffordanceTag = z.enum(["properties", "actions", "events"]);
export type AffordanceTag = z.infer<typeof AffordanceTag>;
