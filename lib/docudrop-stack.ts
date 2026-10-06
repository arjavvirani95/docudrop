import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";
import { DROP_TTL_DAYS } from "../api/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface DocudropStackProps extends StackProps {
  /** Built frontend to publish. Skipped when the folder does not exist (e.g. in unit tests). */
  webDist?: string;
}

export class DocudropStack extends Stack {
  constructor(scope: Construct, id: string, props: DocudropStackProps = {}) {
    super(scope, id, props);

    // ---- Data -------------------------------------------------------------
    const table = new Table(this, "Drops", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const files = new s3.Bucket(this, "Files", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Objects outlive their drop by a day so in-flight downloads can finish.
      lifecycleRules: [{ prefix: "drops/", expiration: Duration.days(DROP_TTL_DAYS + 1) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---- Compute ----------------------------------------------------------
    const fn = (name: string, entry: string) =>
      new NodejsFunction(this, name, {
        entry: path.join(here, "../api/handlers", entry),
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        environment: { TABLE_NAME: table.tableName, BUCKET_NAME: files.bucketName },
        logGroup: new LogGroup(this, `${name}Logs`, { retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
        bundling: { minify: true, sourceMap: true },
      });

    const apiFn = fn("ApiFn", "http.ts");
    table.grantReadWriteData(apiFn);
    files.grantPut(apiFn, "drops/*");
    files.grantRead(apiFn, "drops/*");

    const uploadFn = fn("OnUploadFn", "on-upload.ts");
    table.grantReadWriteData(uploadFn);
    files.grantRead(uploadFn, "drops/*");
    files.addEventNotification(s3.EventType.OBJECT_CREATED, new LambdaDestination(uploadFn), { prefix: "drops/" });

    const api = new HttpApi(this, "Api");
    const integration = new HttpLambdaIntegration("ApiInt", apiFn);
    api.addRoutes({ path: "/api/drops", methods: [HttpMethod.POST], integration });
    api.addRoutes({ path: "/api/drops/{dropId}", methods: [HttpMethod.GET], integration });
    api.addRoutes({ path: "/api/drops/{dropId}/uploads", methods: [HttpMethod.POST], integration });

    // ---- Frontend + CDN ---------------------------------------------------
    const site = new s3.Bucket(this, "Site", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Serve index.html for client-side routes like /d/<id>, without touching /api responses.
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        `function handler(event){var r=event.request;if(!r.uri.includes('.')){r.uri='/index.html';}return r;}`,
      ),
    });

    const apiDomain = `${api.apiId}.execute-api.${this.region}.${this.urlSuffix}`;
    const distribution = new cloudfront.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new HttpOrigin(apiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Browsers POST files straight to S3, so the bucket must accept the site's origin.
    files.addCorsRule({
      allowedMethods: [s3.HttpMethods.POST],
      allowedOrigins: [`https://${distribution.distributionDomainName}`, "http://localhost:5173"],
      allowedHeaders: ["*"],
      maxAge: 3600,
    });

    const webDist = props.webDist ?? path.join(here, "../web/dist");
    if (fs.existsSync(webDist)) {
      new BucketDeployment(this, "DeploySite", {
        sources: [Source.asset(webDist)],
        destinationBucket: site,
        distribution,
        distributionPaths: ["/*"],
      });
    }

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
  }
}
