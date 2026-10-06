import { App } from "aws-cdk-lib";
import { DocudropStack } from "../lib/docudrop-stack.js";

const app = new App();
new DocudropStack(app, "Docudrop", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
