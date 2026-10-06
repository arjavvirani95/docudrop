import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, S3Event } from "aws-lambda";
import { beforeEach, describe, expect, it } from "vitest";
import { makeHttpHandler } from "../api/handlers/http.js";
import { makeUploadHandler } from "../api/handlers/on-upload.js";
import { FakeStorage, MemoryDropStore } from "../api/memory.js";
import { DropService } from "../api/service.js";

let store: MemoryDropStore;
let storage: FakeStorage;
let http: ReturnType<typeof makeHttpHandler>;
let onUpload: ReturnType<typeof makeUploadHandler>;

beforeEach(() => {
  store = new MemoryDropStore();
  storage = new FakeStorage();
  const service = new DropService(store, storage);
  http = makeHttpHandler(service);
  onUpload = makeUploadHandler(service);
});

async function call(routeKey: string, dropId?: string, body?: object) {
  const res = (await http({
    routeKey,
    pathParameters: dropId ? { dropId } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  } as unknown as APIGatewayProxyEventV2)) as APIGatewayProxyStructuredResultV2;
  return { status: res.statusCode, body: JSON.parse(res.body!) };
}

const s3Event = (key: string) => ({ Records: [{ s3: { object: { key } } }] }) as unknown as S3Event;

describe("drop lifecycle", () => {
  it("creates a drop, presigns an upload, records it and lists it", async () => {
    const created = await call("POST /api/drops");
    expect(created.status).toBe(201);
    const { dropId } = created.body;

    const up = await call("POST /api/drops/{dropId}/uploads", dropId, {
      filename: "Q3 report.pdf", contentType: "application/pdf", size: 2048,
    });
    expect(up.status).toBe(201);
    expect(up.body.key).toMatch(new RegExp(`^drops/${dropId}/[0-9a-f-]{36}/Q3_report.pdf$`));

    // Simulate S3 receiving the object and firing the event.
    storage.objects.set(up.body.key, { size: 2048, contentType: "application/pdf" });
    await onUpload(s3Event(up.body.key));

    const drop = await call("GET /api/drops/{dropId}", dropId);
    expect(drop.status).toBe(200);
    expect(drop.body.files).toHaveLength(1);
    expect(drop.body.files[0]).toMatchObject({ filename: "Q3_report.pdf", size: 2048 });
    expect(drop.body.files[0].downloadUrl).toContain("sig=");
  });

  it("returns 404 for unknown, malformed and expired drops", async () => {
    expect((await call("GET /api/drops/{dropId}", "AAAAAAAAAAAAAAAA")).status).toBe(404);
    expect((await call("GET /api/drops/{dropId}", "../bad")).status).toBe(404);
    store.drops.set("BBBBBBBBBBBBBBBB", { dropId: "BBBBBBBBBBBBBBBB", createdAt: "", expiresAt: 1 });
    expect((await call("GET /api/drops/{dropId}", "BBBBBBBBBBBBBBBB")).status).toBe(404);
  });

  it("rejects invalid uploads", async () => {
    const { dropId } = (await call("POST /api/drops")).body;
    const res = await call("POST /api/drops/{dropId}/uploads", dropId, { filename: "x.exe", contentType: "application/x-msdownload", size: 1 });
    expect(res.status).toBe(400);
  });

  it("ignores S3 events for unknown keys", async () => {
    await onUpload(s3Event("random/object.txt"));
    expect(store.files).toHaveLength(0);
  });
});
