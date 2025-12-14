import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient());

const idempotencyTableName = process.env.IDEMPOTENCY_TABLE_NAME;

const canExecute = async (id: string, command: string) => {
  const { Item } = await dynamoClient.send(
    new GetCommand({
      TableName: idempotencyTableName,
      Key: {
        id: `${id}-${command}`,
      },
    })
  );

  return !Item;
};

const markAsExecuted = async (id: string, command: string) => {
  await dynamoClient.send(
    new PutCommand({
      TableName: idempotencyTableName,
      Item: {
        id: `${id}-${command}`,
        expiration: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
    })
  );
};

export const executeOnce = async <T>(id: string, command: string, fn: () => Promise<T>) => {
  if (!(await canExecute(id, command))) {
    return;
  }

  await fn();

  await markAsExecuted(id, command);
};
