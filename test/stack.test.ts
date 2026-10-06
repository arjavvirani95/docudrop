import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { DocudropStack } from "../lib/docudrop-stack.js";

let t: Template;
beforeAll(() => {
  t = Template.fromStack(new DocudropStack(new App(), "Test", { webDist: "/nonexistent" }));
}, 60_000);

describe("DocudropStack", () => {
  it("blocks public access and enforces SSL on the files bucket", () => {
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, RestrictPublicBuckets: true },
      LifecycleConfiguration: { Rules: [Match.objectLike({ Prefix: "drops/", ExpirationInDays: 8 })] },
    });
    const policies = JSON.stringify(t.findResources("AWS::S3::BucketPolicy"));
    expect(policies).toContain("aws:SecureTransport");
  });

  it("uses a single table with TTL", () => {
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });

  it("wires S3 ObjectCreated events under drops/ to the upload Lambda", () => {
    t.hasResourceProperties("Custom::S3BucketNotifications", {
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          Match.objectLike({
            Events: ["s3:ObjectCreated:*"],
            Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "drops/" }] } },
          }),
        ],
      },
    });
  });

  it("routes /api/* through CloudFront without caching", () => {
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: [Match.objectLike({ PathPattern: "/api/*", ViewerProtocolPolicy: "https-only" })],
      }),
    });
  });

  it("exposes exactly the three API routes", () => {
    const keys = Object.values(t.findResources("AWS::ApiGatewayV2::Route")).map(
      (r) => (r as { Properties: { RouteKey: string } }).Properties.RouteKey,
    );
    expect(keys.sort()).toEqual(["GET /api/drops/{dropId}", "POST /api/drops", "POST /api/drops/{dropId}/uploads"]);
  });
});
