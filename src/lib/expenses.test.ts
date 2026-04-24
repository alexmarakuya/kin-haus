import { describe, expect, it } from "vitest";
import { parseBase64Image, filterExpenses } from "./expenses.ts";
import type { Expense } from "./types.ts";

describe("parseBase64Image", () => {
  it("accepts a JPEG data URL", () => {
    const tinyJpeg =
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=";
    const dataUrl = `data:image/jpeg;base64,${tinyJpeg}`;
    const r = parseBase64Image(dataUrl);
    expect("buffer" in r).toBe(true);
    if ("buffer" in r) expect(r.buffer.length).toBeGreaterThan(0);
  });

  it("rejects unsupported mime", () => {
    const r = parseBase64Image(
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    );
    expect("error" in r).toBe(true);
  });
});

describe("filterExpenses", () => {
  const sample: Expense[] = [
    {
      id: "a",
      date: "2026-04-01",
      amount: 100,
      currency: "THB",
      vendor: "A",
      category: "food",
      scope: "business",
      notes: "",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "b",
      date: "2026-04-10",
      amount: 50,
      currency: "THB",
      vendor: "B",
      category: "utilities",
      scope: "personal",
      notes: "",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    },
  ];

  it("filters by date range", () => {
    const r = filterExpenses(sample, { from: "2026-04-05", to: null, category: null, scope: null });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("b");
  });

  it("filters by scope", () => {
    const r = filterExpenses(sample, { from: null, to: null, category: null, scope: "personal" });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("b");
  });
});
