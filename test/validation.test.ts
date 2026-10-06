import { describe, expect, it } from "vitest";
import { isDropId, newDropId, parseObjectKey, sanitizeFilename, validateUpload } from "../api/validation.js";

describe("drop ids", () => {
  it("are 16 url-safe characters", () => {
    const id = newDropId();
    expect(isDropId(id)).toBe(true);
    expect(isDropId("short")).toBe(false);
    expect(isDropId("../../etc/passwd!")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it.each([
    ["report.pdf", "report.pdf"],
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\me\\Q3 plan (final).docx", "Q3_plan_final.docx"],
    [".env", "env"],
    ["résumé.pdf", "resume.pdf"],
    ["???", "file"],
  ])("%s -> %s", (input, expected) => expect(sanitizeFilename(input)).toBe(expected));
});

describe("validateUpload", () => {
  const ok = { filename: "a.pdf", contentType: "application/pdf", size: 1000 };
  it("accepts a valid request", () => expect(validateUpload(ok)).toEqual(ok));
  it("rejects disallowed types and sizes", () => {
    expect(validateUpload({ ...ok, contentType: "text/html" })).toHaveProperty("error");
    expect(validateUpload({ ...ok, size: 0 })).toHaveProperty("error");
    expect(validateUpload({ ...ok, size: 500 * 1024 * 1024 })).toHaveProperty("error");
  });
});

describe("parseObjectKey", () => {
  it("parses well-formed keys including encoded names", () => {
    const key = "drops/abcdEFGH1234_-xy/123e4567-e89b-12d3-a456-426614174000/Q3+plan.pdf";
    expect(parseObjectKey(key)).toEqual({
      dropId: "abcdEFGH1234_-xy",
      fileId: "123e4567-e89b-12d3-a456-426614174000",
      filename: "Q3 plan.pdf",
    });
  });
  it("rejects other keys", () => expect(parseObjectKey("uploads/x.pdf")).toBeNull());
});
