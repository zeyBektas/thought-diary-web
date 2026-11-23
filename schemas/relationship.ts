import { z } from "zod";

export const relationshipRequestSchema = z.object({
  clientId: z.string().trim().uuid("Enter a valid client UUID."),
});
