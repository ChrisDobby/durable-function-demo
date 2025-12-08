import { SQSEvent, LambdaFunctionURLEvent } from "aws-lambda";
import { CreateScheduleCommand, SchedulerClient } from "@aws-sdk/client-scheduler";
import { randomInt, randomUUID } from "crypto";

const client = new SchedulerClient();

const scheduleCallback = async (callbackId: string) => {
  const timeOffset = randomInt(30) * 60 * 1000;
  const queryStringParameters: Record<string, string> = { callbackId, command: "true" };
  if (randomInt(10) > 7) {
    queryStringParameters.fail = "true";
  }

  await client.send(
    new CreateScheduleCommand({
      Name: `callback-${randomUUID()}`,
      ScheduleExpression: `at(${new Date(Date.now() + timeOffset).toISOString().slice(0, -5)})`,
      State: "ENABLED",
      Target: {
        RoleArn: process.env.SCHEDULE_ROLE_ARN,
        Arn: process.env.CALLBACK_API_LAMBDA,
        Input: JSON.stringify({ queryStringParameters }),
        RetryPolicy: {
          MaximumRetryAttempts: 0,
        },
      },
      FlexibleTimeWindow: {
        Mode: "OFF",
      },
      ActionAfterCompletion: "DELETE",
    })
  );
};

export const handler = async (event: SQSEvent | LambdaFunctionURLEvent) => {
  if (
    "queryStringParameters" in event &&
    event.queryStringParameters &&
    event.queryStringParameters.callbackId
  ) {
    await scheduleCallback(event.queryStringParameters.callbackId);
  }

  if ("Records" in event) {
    await Promise.all(
      event.Records.map((record) => scheduleCallback(JSON.parse(record.body).callbackId))
    );
  }

  return { statusCode: 200 };
};
