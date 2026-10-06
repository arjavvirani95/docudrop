import type { S3Event } from "aws-lambda";
import { DynamoDropStore, S3ObjectStorage } from "../aws.js";
import { DropService } from "../service.js";

export function makeUploadHandler(service: DropService) {
  return async (event: S3Event) => {
    for (const record of event.Records) {
      const ok = await service.recordUpload(record.s3.object.key);
      if (!ok) console.warn("Ignored object", record.s3.object.key);
    }
  };
}

export const handler = makeUploadHandler(
  new DropService(new DynamoDropStore(process.env.TABLE_NAME!), new S3ObjectStorage(process.env.BUCKET_NAME!)),
);
