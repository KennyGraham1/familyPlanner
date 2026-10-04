import { z } from "zod";
import { dataSchema } from "./data";
export const accessSchema = z.object({
  user_id: z.string().uuid(),
  member_id: z.string().nullable(),
  name: z.string(),
  is_owner: z.boolean(),
});
export type FamilyAccess = z.infer<typeof accessSchema>;
export const familyContextSchema = z.object({
  household_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  member_id: z.string().nullable(),
  updated_at: z.string(),
  access: z.array(accessSchema),
  data: dataSchema,
});
