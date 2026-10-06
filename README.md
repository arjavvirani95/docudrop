# docudrop

[![CI](https://github.com/arjavvirani95/docudrop/actions/workflows/ci.yml/badge.svg)](https://github.com/arjavvirani95/docudrop/actions/workflows/ci.yml)

Share files through a private link that expires after 7 days. A cloud app on **AWS**: React frontend on **CloudFront + S3**, API on **Lambda + API Gateway**, metadata in **DynamoDB**, and file bytes uploaded **straight from the browser to S3** with presigned POSTs. Everything is defined in **AWS CDK** (TypeScript).

## Architecture

```
Browser ──► CloudFront ─┬─ /*      ─► S3 (site bucket, OAC, SPA rewrite function)
                        └─ /api/*  ─► API Gateway ─► ApiFn ──► DynamoDB (single table, TTL)
   │                                                  │
   │  presigned POST (exact key, type and size)        │ presigns
   └──────────────────────────────────────────────►  S3 files bucket ── ObjectCreated ─► OnUploadFn ─► DynamoDB
                                                       (private, SSE, SSL-only, 8-day lifecycle)
```

### Upload flow

1. `POST /api/drops` creates a drop with an unguessable 96-bit id and a 7-day expiry.
2. `POST /api/drops/{id}/uploads` validates the file name, type and size, then returns a **presigned POST** whose policy pins the exact object key, `Content-Type` and byte length.
3. The browser uploads directly to S3 with progress, so file bytes never pass through Lambda.
4. S3 fires `ObjectCreated`, and `OnUploadFn` reads the real size and type with `HeadObject` before recording the file. The list only ever shows files that actually arrived.
5. `GET /api/drops/{id}` returns the files with short-lived presigned download links.

### Expiry

DynamoDB TTL removes the drop and file items, and an S3 lifecycle rule deletes the objects a day later. Expired drops return 404 straight away, without waiting for TTL to run.

## Security

- Both buckets block all public access; the site is served through CloudFront Origin Access Control
- SSL-only bucket policies and S3-managed encryption
- Allow-list of content types, a 100 MB limit, and a cap on files per drop
- File names are sanitised: path parts are stripped and unsafe characters removed
- Upload CORS is limited to the CloudFront domain (and localhost for development)
- IAM grants are scoped to the `drops/*` prefix

## Project layout

```
api/            Lambda code: service, validation, AWS adapters, handlers
lib/            CDK stack
web/            React + Vite frontend
test/           service tests (in-memory adapters) + CDK assertion tests
```

## Development

```bash
npm install
npm test                 # service + infrastructure tests
npm run build:web
npx cdk deploy           # needs AWS credentials and `cdk bootstrap`
```

To run the frontend against a deployed API: `VITE_API_PROXY=https://<api-id>.execute-api.<region>.amazonaws.com npm run dev -w web`.

## License

MIT
