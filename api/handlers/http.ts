import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDropStore, S3ObjectStorage } from "../aws.js";
import { DropService, HttpError } from "../service.js";
import { isDropId } from "../validation.js";

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {}
  throw new HttpError(400, "Body must be a JSON object");
}

export function makeHttpHandler(service: DropService) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
      const route = event.routeKey;
      const dropId = event.pathParameters?.dropId;
      if (dropId !== undefined && !isDropId(dropId)) throw new HttpError(404, "Drop not found or expired");

      switch (route) {
        case "POST /api/drops":
          return json(201, await service.createDrop());
        case "GET /api/drops/{dropId}":
          return json(200, await service.getDrop(dropId!));
        case "POST /api/drops/{dropId}/uploads":
          return json(201, await service.requestUpload(dropId!, parseBody(event)));
        default:
          return json(404, { error: "Not found" });
      }
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: "Internal error" });
    }
  };
}

export const handler = makeHttpHandler(
  new DropService(new DynamoDropStore(process.env.TABLE_NAME!), new S3ObjectStorage(process.env.BUCKET_NAME!)),
);
