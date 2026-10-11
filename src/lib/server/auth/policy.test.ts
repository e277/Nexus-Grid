import { describe, expect, it } from "vitest";

import {
  hashToken,
  matchApiToken,
  parseApiTokens,
  policyFromEnv,
  resolveRole,
  satisfies,
} from "./policy";

const policy = policyFromEnv({
  AUTH_ADMIN_EMAILS: "Chief@Ministry.gov.jm",
  AUTH_OPERATOR_EMAILS: "ops@coop.tt, chief@ministry.gov.jm",
  AUTH_VIEWER_EMAILS: "analyst@example.org",
  AUTH_ALLOWED_DOMAINS: "@ministry.gov.jm",
  AUTH_API_TOKENS: `scraper:admin:${hashToken("ngk_secret")}`,
});

describe("resolveRole", () => {
  it("gives each listed address its role, case-insensitively", () => {
    expect(resolveRole("ops@coop.tt", policy)).toBe("operator");
    expect(resolveRole("ANALYST@example.org", policy)).toBe("viewer");
  });

  it("gives an address on two lists the stronger role", () => {
    expect(resolveRole("chief@ministry.gov.jm", policy)).toBe("admin");
  });

  it("gives an allowed domain the default role", () => {
    expect(resolveRole("clerk@ministry.gov.jm", policy)).toBe("viewer");
  });

  it("does not treat a lookalike subdomain as the allowed domain", () => {
    expect(resolveRole("x@evil.ministry.gov.jm", policy)).toBeNull();
    expect(resolveRole("x@ministry.gov.jm.evil.com", policy)).toBeNull();
  });

  it("refuses anyone not on a list, and anything that is not an address", () => {
    expect(resolveRole("stranger@gmail.com", policy)).toBeNull();
    expect(resolveRole("", policy)).toBeNull();
    expect(resolveRole(null, policy)).toBeNull();
    expect(resolveRole("not-an-address", policy)).toBeNull();
  });

  it("refuses everyone when nothing is configured", () => {
    expect(resolveRole("anyone@anywhere.com", policyFromEnv({}))).toBeNull();
  });

  it("honours AUTH_DEFAULT_ROLE and ignores an invalid one", () => {
    const ops = policyFromEnv({ AUTH_ALLOWED_DOMAINS: "coop.tt", AUTH_DEFAULT_ROLE: "Operator" });
    expect(resolveRole("a@coop.tt", ops)).toBe("operator");
    const bad = policyFromEnv({ AUTH_ALLOWED_DOMAINS: "coop.tt", AUTH_DEFAULT_ROLE: "root" });
    expect(resolveRole("a@coop.tt", bad)).toBe("viewer");
  });
});

describe("satisfies", () => {
  it("orders viewer < operator < admin", () => {
    expect(satisfies("admin", "operator")).toBe(true);
    expect(satisfies("operator", "operator")).toBe(true);
    expect(satisfies("viewer", "operator")).toBe(false);
    expect(satisfies("operator", "admin")).toBe(false);
  });
});

describe("API tokens", () => {
  it("matches a presented token by its hash", () => {
    expect(matchApiToken("ngk_secret", policy)).toMatchObject({ name: "scraper", role: "admin" });
    expect(matchApiToken("ngk_wrong", policy)).toBeNull();
    expect(matchApiToken("", policy)).toBeNull();
  });

  it("drops malformed entries without losing the good ones", () => {
    const tokens = parseApiTokens(
      `ok:viewer:${hashToken("a")}, bad-role:root:${hashToken("b")}, short:viewer:abc, :viewer:${hashToken("c")}`
    );
    expect(tokens.map((token) => token.name)).toEqual(["ok"]);
  });
});
