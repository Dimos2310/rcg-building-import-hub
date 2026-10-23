import { describe, expect, it } from "vitest";
import { collectPages } from "./pagination.ts";

function source(total: number) {
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i);
  };
  return { fetchPage, calls };
}

describe("collectPages", () => {
  it("returns everything when the table is larger than one page", async () => {
    const { fetchPage, calls } = source(2500);
    const rows = await collectPages(fetchPage, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(2499);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("makes one extra request when the size is an exact multiple of the page", async () => {
    const { fetchPage, calls } = source(2000);
    expect(await collectPages(fetchPage, 1000)).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("handles an empty table with a single request", async () => {
    const { fetchPage, calls } = source(0);
    expect(await collectPages(fetchPage, 1000)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("propagates a failure", async () => {
    await expect(
      collectPages(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
