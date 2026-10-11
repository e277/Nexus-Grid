import { describe, expect, it } from "vitest";

import { safeCallback } from "./safe-redirect";

describe("safeCallback", () => {
  it("keeps a same-site path", () => {
    expect(safeCallback("/console?tab=1")).toBe("/console?tab=1");
  });

  it("refuses anything that leaves the site", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, ["/x"]]) {
      expect(safeCallback(value)).toBe("/console");
    }
  });
});
