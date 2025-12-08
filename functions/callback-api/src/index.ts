import {
  CallbackTimeoutException,
  InvalidParameterValueException,
  LambdaClient,
  SendDurableExecutionCallbackFailureCommand,
  SendDurableExecutionCallbackSuccessCommand,
} from "@aws-sdk/client-lambda";
import { LambdaFunctionURLEvent } from "aws-lambda";

const client = new LambdaClient();

export const handler = async (event: LambdaFunctionURLEvent) => {
  const { queryStringParameters } = event;
  if (!queryStringParameters) {
    return { statusCode: 400 };
  }

  const { callbackId, fail, command } = queryStringParameters;
  if (!callbackId) {
    return { statusCode: 400 };
  }

  try {
    const callbackCommand = fail
      ? new SendDurableExecutionCallbackFailureCommand({
          CallbackId: callbackId,
        })
      : new SendDurableExecutionCallbackSuccessCommand({
          CallbackId: callbackId,
          Result: JSON.stringify(command ? { success: true } : { approved: true }),
        });
    await client.send(callbackCommand);
  } catch (error) {
    if (
      error instanceof InvalidParameterValueException ||
      error instanceof CallbackTimeoutException
    ) {
      return { statusCode: 400 };
    }

    throw error;
  }

  return { statusCode: 200 };
};
