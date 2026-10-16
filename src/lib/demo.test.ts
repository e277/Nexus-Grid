import { describe, expect, it } from "vitest";

import { DEMO_ROLES, demoEmail, demoRoleOf, isDemoEmail } from "./demo";

describe("demo accounts", () => {
  it("reads each role back from its own address", () => {
    for (const role of DEMO_ROLES) expect(demoRoleOf(demoEmail(role))).toBe(role);
  });

  it("puts every demo address under the reserved .invalid domain", () => {
    for (const role of DEMO_ROLES) expect(demoEmail(role)).toMatch(/\.invalid$/);
  });

  it("matches regardless of case and surrounding space", () => {
    expect(demoRoleOf("  Operator@Demo.Nexus-Grid.Invalid ")).toBe("operator");
  });

  it("gives no role to any other address", () => {
    expect(demoRoleOf("admin@example.org")).toBeNull();
    expect(demoRoleOf("owner@demo.nexus-grid.invalid")).toBeNull();
    expect(demoRoleOf("admin@demo.nexus-grid.invalid.example.org")).toBeNull();
    expect(demoRoleOf(null)).toBeNull();
    expect(isDemoEmail(undefined)).toBe(false);
  });
});
