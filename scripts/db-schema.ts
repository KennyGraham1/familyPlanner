// Regenerates the database's copy of the planner JSON schema from src/lib/data.ts.
// Run after changing the data model: npm run db:schema
// Then re-run supabase/schema.sql in the Supabase SQL editor.
import { readFileSync, writeFileSync } from "node:fs";
import { plannerJsonSchema } from "../src/lib/json-schema";

const json = JSON.stringify(plannerJsonSchema());
writeFileSync(
  "supabase/planner.schema.json",
  JSON.stringify(plannerJsonSchema(), null, 2) + "\n",
);
const sql = readFileSync("supabase/schema.sql", "utf8");
const marker = /\$schema\$[\s\S]*?\$schema\$/;
if (!marker.test(sql)) throw new Error("No $schema$ block found in schema.sql");
writeFileSync(
  "supabase/schema.sql",
  sql.replace(marker, () => `$schema$${json}$schema$`),
);
console.log("Updated supabase/planner.schema.json and supabase/schema.sql");
