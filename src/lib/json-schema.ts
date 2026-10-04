import { z } from "zod";
import { dataSchema } from "./data";

/** The JSON schema the database uses to validate family documents (see supabase/schema.sql). */
export function plannerJsonSchema() {
  return z.toJSONSchema(dataSchema, {
    target: "draft-7",
    unrepresentable: "any",
  });
}
