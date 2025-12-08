import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const client = new SQSClient();

export const commandOne = async (callbackId: string) => {
  await client.send(
    new SendMessageCommand({
      QueueUrl: process.env.COMMAND_QUEUE_URL,
      MessageBody: JSON.stringify({ callbackId }),
    })
  );
};

export const commandTwo = async (callbackId: string) => {
  await fetch(`${process.env.COMMAND_URL}?callbackId=${callbackId}`, {
    method: "POST",
  });
};
