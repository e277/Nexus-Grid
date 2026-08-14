import { describe, expect, it } from "vitest";

import { extractJson } from "./provider";

describe("extractJson", () => {
  it("returns a bare object unchanged", () => {
    expect(JSON.parse(extractJson('{"summary":"a","findings":[]}'))).toEqual({
      summary: "a",
      findings: [],
    });
  });

  it("stops at the end of the object when the model keeps talking", () => {
    // The failure this exists for: a valid answer followed by prose. Scanning
    // to the last brace in the text swallowed the commentary and threw away a
    // perfectly good reading.
    const answer = '{"summary":"a","findings":[]}\n\nI hope this helps! {see notes}';
    expect(JSON.parse(extractJson(answer))).toEqual({ summary: "a", findings: [] });
  });

  it("ignores braces inside strings", () => {
    const answer = '{"summary":"uses {braces} in prose","findings":[]} trailing';
    expect(JSON.parse(extractJson(answer))).toEqual({
      summary: "uses {braces} in prose",
      findings: [],
    });
  });

  it("handles an escaped quote before a brace", () => {
    const answer = '{"summary":"a \\" quote","findings":[]} trailing }';
    expect(JSON.parse(extractJson(answer))).toEqual({ summary: 'a " quote', findings: [] });
  });

  it("keeps nested objects whole", () => {
    const answer = '{"a":{"b":{"c":1}},"d":2} and then some words';
    expect(JSON.parse(extractJson(answer))).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  it("unwraps a fenced block", () => {
    const answer = '```json\n{"summary":"a","findings":[]}\n```';
    expect(JSON.parse(extractJson(answer))).toEqual({ summary: "a", findings: [] });
  });

  it("drops a thinking preamble", () => {
    const answer = '<think>weighing the figures</think>{"summary":"a","findings":[]}';
    expect(JSON.parse(extractJson(answer))).toEqual({ summary: "a", findings: [] });
  });

  it("returns the fragment when the object never closes, rather than guessing", () => {
    // Inventing a closing brace would turn a truncated response into a
    // confident one. Better to hand back the fragment and fail to parse.
    const answer = '{"summary":"a","findings":[';
    expect(() => JSON.parse(extractJson(answer))).toThrow();
  });
});
