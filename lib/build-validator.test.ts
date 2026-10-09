import { describe, test, expect, beforeEach, afterEach, spyOn, jest } from "bun:test";
import {
  extractMissingPackages,
  classifyError,
  calculateRetryDelay,
  validateBuild,
} from "./build-validator";

// ---------------------------------------------------------------------------
// extractMissingPackages
// ---------------------------------------------------------------------------
describe("extractMissingPackages", () => {
  test("pattern 1: Failed to resolve import (double quotes)", () => {
    expect(extractMissingPackages(new Error('Failed to resolve import "react-icons"'))).toEqual(["react-icons"]);
  });

  test("pattern 1: Failed to resolve import (single quotes)", () => {
    expect(extractMissingPackages(new Error("Failed to resolve import 'lodash'"))).toEqual(["lodash"]);
  });

  test("pattern 2: Cannot find module", () => {
    expect(extractMissingPackages(new Error("Cannot find module 'some-pkg'"))).toEqual(["some-pkg"]);
  });

  test("pattern 3: Package not found", () => {
    expect(extractMissingPackages(new Error("Package 'my-lib' not found"))).toEqual(["my-lib"]);
  });

  test("deduplicates packages", () => {
    const err = new Error('Failed to resolve import "react-icons"\nFailed to resolve import "react-icons"');
    expect(extractMissingPackages(err)).toEqual(["react-icons"]);
  });

  test("extracts multiple distinct packages", () => {
    const err = new Error('Failed to resolve import "pkg-a"\nCannot find module \'pkg-b\'');
    expect(extractMissingPackages(err)).toEqual(["pkg-a", "pkg-b"]);
  });

  test("returns empty array when no pattern matches", () => {
    expect(extractMissingPackages(new Error("unrelated error"))).toEqual([]);
  });

  test("handles non-Error string via String()", () => {
    expect(extractMissingPackages("Cannot find module 'inline-pkg'")).toEqual(["inline-pkg"]);
  });

  test("handles object with message property", () => {
    expect(extractMissingPackages({ message: "Package 'custom' not found" })).toEqual(["custom"]);
  });
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------
describe("classifyError", () => {
  test("missing-package: Failed to resolve import", () => {
    expect(classifyError(new Error("Failed to resolve import 'x'"))).toBe("missing-package");
  });

  test("missing-package: Cannot find module", () => {
    expect(classifyError(new Error("Cannot find module 'y'"))).toBe("missing-package");
  });

  test("missing-package: Missing package", () => {
    expect(classifyError(new Error("Missing package: z"))).toBe("missing-package");
  });

  test("syntax-error: syntax error", () => {
    expect(classifyError(new Error("SyntaxError: unexpected token"))).toBe("syntax-error");
  });

  test("syntax-error: parsing error", () => {
    expect(classifyError(new Error("parsing error at line 5"))).toBe("syntax-error");
  });

  test("sandbox-timeout: timed out", () => {
    expect(classifyError(new Error("Request timed out"))).toBe("sandbox-timeout");
  });

  test("sandbox-timeout: not responding", () => {
    expect(classifyError(new Error("Sandbox not responding"))).toBe("sandbox-timeout");
  });

  test("not-rendered: default page", () => {
    expect(classifyError(new Error("Sandbox showing default page"))).toBe("not-rendered");
  });

  test("not-rendered: app not rendered", () => {
    expect(classifyError(new Error("App not rendered yet"))).toBe("not-rendered");
  });

  test("vite-error: vite keyword", () => {
    expect(classifyError(new Error("Vite compilation failed"))).toBe("vite-error");
  });

  test("vite-error: compilation keyword", () => {
    expect(classifyError(new Error("compilation error detected"))).toBe("vite-error");
  });

  test("unknown: unrecognized message", () => {
    expect(classifyError(new Error("some completely unrelated message"))).toBe("unknown");
  });

  test("case-insensitive matching", () => {
    expect(classifyError(new Error("SYNTAX ERROR in file"))).toBe("syntax-error");
  });
});

// ---------------------------------------------------------------------------
// calculateRetryDelay
// ---------------------------------------------------------------------------
describe("calculateRetryDelay", () => {
  const BASE = 2000;

  test("missing-package: 2× base × attempt", () => {
    expect(calculateRetryDelay(1, "missing-package")).toBe(BASE * 2 * 1); // 4000
    expect(calculateRetryDelay(3, "missing-package")).toBe(BASE * 2 * 3); // 12000
  });

  test("not-rendered: 3× base × attempt", () => {
    expect(calculateRetryDelay(1, "not-rendered")).toBe(BASE * 3 * 1); // 6000
    expect(calculateRetryDelay(2, "not-rendered")).toBe(BASE * 3 * 2); // 12000
  });

  test("vite-error: 2× base × attempt", () => {
    expect(calculateRetryDelay(1, "vite-error")).toBe(BASE * 2 * 1); // 4000
    expect(calculateRetryDelay(4, "vite-error")).toBe(BASE * 2 * 4); // 16000
  });

  test("sandbox-timeout: 4× base × attempt", () => {
    expect(calculateRetryDelay(1, "sandbox-timeout")).toBe(BASE * 4 * 1); // 8000
    expect(calculateRetryDelay(2, "sandbox-timeout")).toBe(BASE * 4 * 2); // 16000
  });

  test("unknown falls through to base × attempt", () => {
    expect(calculateRetryDelay(1, "unknown")).toBe(BASE * 1); // 2000
    expect(calculateRetryDelay(3, "unknown")).toBe(BASE * 3); // 6000
  });

  test("syntax-error falls through to base × attempt", () => {
    expect(calculateRetryDelay(2, "syntax-error")).toBe(BASE * 2); // 4000
  });

  test("delay scales linearly with attempt", () => {
    const delay1 = calculateRetryDelay(1, "missing-package");
    const delay2 = calculateRetryDelay(2, "missing-package");
    expect(delay2).toBe(delay1 * 2);
  });
});

// ---------------------------------------------------------------------------
// validateBuild
// ---------------------------------------------------------------------------
describe("validateBuild", () => {
  function mockFetch(status: number, body: string) {
    return spyOn(globalThis, "fetch").mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as Response);
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function runWithTimers<T>(fn: () => Promise<T>): Promise<T> {
    const promise = fn();
    jest.runAllTimers();
    return promise;
  }

  test("returns success when app renders correctly", async () => {
    const spy = mockFetch(200, '<div id="root"><app /></div>');
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(true);
    expect(result.isRendering).toBe(true);
    expect(result.errors).toHaveLength(0);
    spy.mockRestore();
  });

  test("returns failure when sandbox responds with non-OK status", async () => {
    const spy = mockFetch(503, "");
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    expect(result.isRendering).toBe(false);
    expect(result.errors[0]).toContain("503");
    spy.mockRestore();
  });

  test("detects default Vite + React page", async () => {
    const spy = mockFetch(200, "<html><body>Vite + React</body></html>");
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("default page");
    spy.mockRestore();
  });

  test("detects Vercel Sandbox Ready page", async () => {
    const spy = mockFetch(200, "<html>Vercel Sandbox Ready</html>");
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("default page");
    spy.mockRestore();
  });

  test("detects page missing root element", async () => {
    const spy = mockFetch(200, "<html><body>no root div here</body></html>");
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    spy.mockRestore();
  });

  test("detects vite-error-overlay with generic error", async () => {
    const spy = mockFetch(200, '<div id="root"></div><vite-error-overlay></vite-error-overlay>');
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toBe("Vite compilation error detected");
    spy.mockRestore();
  });

  test("extracts missing package name from vite-error-overlay", async () => {
    const body = `<div id="root"></div><vite-error-overlay>Failed to resolve import "react-confetti"</vite-error-overlay>`;
    const spy = mockFetch(200, body);
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toBe("Missing package: react-confetti");
    spy.mockRestore();
  });

  test("returns failure on network error", async () => {
    const spy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const result = await runWithTimers(() => validateBuild("https://sandbox.test", "sid"));
    expect(result.success).toBe(false);
    expect(result.isRendering).toBe(false);
    expect(result.errors[0]).toBe("Network failure");
    spy.mockRestore();
    consoleSpy.mockRestore();
  });
});
