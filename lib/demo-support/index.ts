import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";

export const createSupport = (scope: Construct, namespace: string, commandQueue: sqs.Queue) => {
  const dummyCustomerSns = new sns.Topic(scope, "DummyCustomerSns", {
    topicName: `${namespace}-dummy-customer`,
  });

  const callbackApiRole = new iam.Role(scope, "CallbackApiRole", {
    roleName: `${namespace}-callback-api-role`,
    assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayFullAccess"),
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"),
      iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
    ],
    inlinePolicies: {
      [`${namespace}-lambda-policy`]: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["lambda:*"],
            resources: ["*"],
          }),
        ],
      }),
    },
  });

  const callbackApiLambda = new nodejs.NodejsFunction(scope, "CallbackApiLambda", {
    functionName: `${namespace}-callback-api`,
    entry: "functions/callback-api/src/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_LATEST,
    role: callbackApiRole,
  });

  const callbackFunctionUrl = callbackApiLambda.addFunctionUrl({
    authType: lambda.FunctionUrlAuthType.NONE,
  });

  const schedulerRole = new iam.Role(scope, "SchedulerRole", {
    roleName: `${namespace}-scheduler-role`,
    assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    inlinePolicies: {
      [`${namespace}-lambda-policy`]: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: [callbackApiLambda.functionArn],
          }),
        ],
      }),
    },
  });

  const commandLambdaRole = new iam.Role(scope, "CommandLambdaRole", {
    roleName: `${namespace}-command-role`,
    assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayFullAccess"),
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"),
      iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
    ],
    inlinePolicies: {
      [`${namespace}-scheduler-policy`]: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["scheduler:*"],
            resources: ["arn:aws:scheduler:*:*:schedule/*/*"],
          }),
        ],
      }),
      [`${namespace}-pass-role`]: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["iam:PassRole"],
            resources: [`arn:aws:iam::*:role/${namespace}-*`],
          }),
        ],
      }),
    },
  });

  const commandLambda = new nodejs.NodejsFunction(scope, "CommandLambda", {
    functionName: `${namespace}-command`,
    entry: "functions/command/src/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_LATEST,
    role: commandLambdaRole,
    bundling: {
      externalModules: ["@aws-sdk/client-scheduler"],
      format: nodejs.OutputFormat.ESM,
      target: "esnext",
      platform: "node",
    },
    environment: {
      SCHEDULE_ROLE_ARN: schedulerRole.roleArn,
      CALLBACK_API_LAMBDA: callbackApiLambda.functionArn,
    },
  });

  const commandFunctionUrl = commandLambda.addFunctionUrl({
    authType: lambda.FunctionUrlAuthType.NONE,
  });

  commandLambda.addEventSource(new cdk.aws_lambda_event_sources.SqsEventSource(commandQueue));
  commandQueue.grantSendMessages(commandLambda);

  return {
    approvalSnsTopicArn: dummyCustomerSns.topicArn,
    approvalApiUrl: callbackFunctionUrl.url,
    commandUrl: commandFunctionUrl.url,
  };
};
