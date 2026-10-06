import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DOWNLOAD_URL_TTL_SECONDS, UPLOAD_URL_TTL_SECONDS } from "./config.js";
import type { Drop, DropStore, ObjectStorage, StoredFile } from "./ports.js";

/**
 * Single-table design:
 *   pk = DROP#<id>, sk = META            -> drop metadata
 *   pk = DROP#<id>, sk = FILE#<fileId>   -> one item per uploaded file
 * Every item carries `ttl` so the whole drop disappears together.
 */
export class DynamoDropStore implements DropStore {
  constructor(private table: string, private doc = DynamoDBDocumentClient.from(new DynamoDBClient({}))) {}

  async createDrop(drop: Drop) {
    await this.doc.send(new PutCommand({
      TableName: this.table,
      Item: { pk: `DROP#${drop.dropId}`, sk: "META", ...drop, ttl: drop.expiresAt },
      ConditionExpression: "attribute_not_exists(pk)",
    }));
  }

  async getDrop(dropId: string) {
    const { Item } = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: `DROP#${dropId}`, sk: "META" } }));
    if (!Item || Item.expiresAt * 1000 < Date.now()) return undefined;
    return { dropId: Item.dropId, createdAt: Item.createdAt, expiresAt: Item.expiresAt } as Drop;
  }

  async addFile(file: StoredFile, expiresAt: number) {
    await this.doc.send(new PutCommand({
      TableName: this.table,
      Item: { pk: `DROP#${file.dropId}`, sk: `FILE#${file.fileId}`, ...file, ttl: expiresAt },
    }));
  }

  async listFiles(dropId: string) {
    const { Items = [] } = await this.doc.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :file)",
      ExpressionAttributeValues: { ":pk": `DROP#${dropId}`, ":file": "FILE#" },
    }));
    return Items.map(({ pk, sk, ttl, ...file }) => file as StoredFile);
  }
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(private bucket: string, private s3 = new S3Client({})) {}

  async presignUpload(key: string, contentType: string, size: number) {
    // The policy pins the exact key, content type and size so the URL can't be reused for anything else.
    return createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [["content-length-range", size, size], ["eq", "$Content-Type", contentType]],
      Fields: { "Content-Type": contentType },
      Expires: UPLOAD_URL_TTL_SECONDS,
    });
  }

  async presignDownload(key: string, filename: string) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  async head(key: string) {
    const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "application/octet-stream" };
  }
}
