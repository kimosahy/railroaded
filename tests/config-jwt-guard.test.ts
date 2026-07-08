import { describe, test, expect } from "bun:test";

// The guard lives in src/config.ts module scope, so exercise it by importing
// the module fresh under different env combinations via subprocesses.

async function importConfigWith(env: Record<string, string | undefined>): Promise<number> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "-e", 'await import("./src/config.ts")'],
    cwd: `${import.meta.dir}/..`,
    env: { ...process.env, ...env } as Record<string, string>,
    stdout: "ignore",
    stderr: "ignore",
  });
  return proc.exited;
}

describe("JWT_SECRET production guard", () => {
  test("production + default secret refuses to boot", async () => {
    const code = await importConfigWith({ NODE_ENV: "production", JWT_SECRET: undefined });
    expect(code).not.toBe(0);
  });

  test("production + real secret boots", async () => {
    const code = await importConfigWith({ NODE_ENV: "production", JWT_SECRET: "a-real-secret" });
    expect(code).toBe(0);
  });

  test("development + default secret boots", async () => {
    const code = await importConfigWith({ NODE_ENV: "development", JWT_SECRET: undefined });
    expect(code).toBe(0);
  });
});
