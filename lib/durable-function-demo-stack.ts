import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamo from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { createSupport } from "./demo-support";

const namespace = "durable-function-demo";
export class DurableFunctionDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const processTable = new dynamo.Table(this, "ProcessTable", {
      tableName: `${namespace}-process`,
      partitionKey: {
        name: "id",
        type: dynamo.AttributeType.STRING,
      },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
    });

    const commandQueue = new sqs.Queue(this, "CommandQueue", {
      queueName: `${namespace}-command`,
    });

    const { approvalSnsTopicArn, approvalApiUrl, commandUrl } = createSupport(
      this,
      namespace,
      commandQueue
    );

    const lambdaRole = new iam.Role(this, "LambdaRole", {
      roleName: `${namespace}-workflow-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
      ],
      inlinePolicies: {
        [`${namespace}-dynamo-policy`]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["dynamodb:*"],
              resources: [
                `arn:aws:dynamodb:*:*:table/${namespace}-*/stream/*`,
                `arn:aws:dynamodb:*:*:table/${namespace}-*/index/*`,
                `arn:aws:dynamodb:*:*:table/${namespace}-*`,
              ],
            }),
          ],
        }),
        [`${namespace}-sns-policy`]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["sns:*"],
              resources: [approvalSnsTopicArn],
            }),
          ],
        }),
        [`${namespace}-sqs-policy`]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["sqs:*"],
              resources: [commandQueue.queueArn],
            }),
          ],
        }),
        [`${namespace}-durable-lambda-policy`]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["lambda:CheckpointDurableExecution", "lambda:GetDurableExecutionState"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    new nodejs.NodejsFunction(this, "WorkflowLambda", {
      functionName: `${namespace}-workflow`,
      entry: "functions/workflow/src/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_LATEST,
      role: lambdaRole,
      durableConfig: {
        executionTimeout: cdk.Duration.days(2),
        retentionPeriod: cdk.Duration.days(14),
      },
      bundling: {
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/lib-dynamodb",
          "@aws-sdk/client-sns",
          "@aws-sdk/client-sqs",
          "@aws/durable-execution-sdk-js",
        ],
        format: nodejs.OutputFormat.ESM,
        target: "esnext",
        platform: "node",
      },
      environment: {
        PROCESS_TABLE_NAME: processTable.tableName,
        APPROVAL_TOPIC_ARN: approvalSnsTopicArn,
        APPROVAL_API_URL: approvalApiUrl,
        COMMAND_URL: commandUrl,
        COMMAND_QUEUE_URL: commandQueue.queueUrl,
      },
    });
  }
}
