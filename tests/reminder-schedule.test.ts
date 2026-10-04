import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const script = readFileSync("supabase/schedule-reminders.sql", "utf8").replace(
  /^create extension .*$/gm,
  "",
);
// Stand-ins for Supabase Vault, Cron and pg_net, with the same names and arguments.
const stubs = `
  create schema extensions;
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  create schema cron;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint
    language sql as $$
      insert into cron.job values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
      select 1::bigint;
    $$;
  create schema net;
  create table net.calls (url text, headers jsonb, timeout_milliseconds int);
  create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}',
    timeout_milliseconds int default 5000) returns bigint
    language sql as $$
      insert into net.calls values (url, headers, timeout_milliseconds);
      select 1::bigint;
    $$;
`;
async function database() {
  const db = new PGlite();
  await db.exec(stubs);
  return db;
}

describe("schedule-reminders.sql", () => {
  it("refuses to run until both Vault secrets exist", async () => {
    const db = await database();
    await assert.rejects(
      db.exec(script),
      /Add kinfolk_site_url and kinfolk_cron_secret to Vault first/,
    );
    await db.close();
  });

  it("calls the send route every minute with the cron secret", async () => {
    const db = await database();
    await db.exec(`
      insert into vault.decrypted_secrets values
        ('kinfolk_site_url', 'https://kinfolk.example/'),
        ('kinfolk_cron_secret', 'secret-value');
    `);
    await db.exec(script);
    await db.exec(script); // Re-running updates the same job.
    const jobs = await db.query<{ schedule: string; command: string }>(
      "select schedule, command from cron.job where jobname = 'kinfolk-phone-reminders'",
    );
    assert.equal(jobs.rows.length, 1);
    assert.equal(jobs.rows[0].schedule, "* * * * *");

    await db.exec(jobs.rows[0].command);
    const calls = await db.query<{
      url: string;
      headers: Record<string, string>;
      timeout_milliseconds: number;
    }>("select * from net.calls");
    assert.deepEqual(calls.rows, [
      {
        url: "https://kinfolk.example/api/reminders/send",
        headers: { Authorization: "Bearer secret-value" },
        timeout_milliseconds: 55000,
      },
    ]);
    await db.close();
  });
});
