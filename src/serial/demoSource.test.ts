import { afterEach, describe, expect, it, vi } from "vitest";
import { startDemoSource } from "./demoSource";
import { parseLine } from "./parseLine";

describe("demo serial source", () => {
  afterEach(() => vi.useRealTimers());

  it("emits firmware-format text consumed by the same parser", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const stop = startDemoSource((line) => lines.push(line));
    vi.advanceTimersByTime(200);
    stop();

    expect(lines.some((line) => parseLine(line, 0).type === "boot")).toBe(true);
    expect(lines.some((line) => parseLine(line, 0).type === "ldr")).toBe(true);
    expect(lines.some((line) => parseLine(line, 0).type === "acessoPermitido")).toBe(true);
  });
});
