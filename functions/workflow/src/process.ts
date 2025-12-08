import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const processTableName = process.env.PROCESS_TABLE_NAME;

export const createProcess = async () => {
  const id = crypto.randomUUID();
  await dynamoClient.send(
    new PutCommand({
      TableName: processTableName,
      Item: {
        id,
        status: "pending",
      },
    })
  );

  return id;
};

export const setProcessStatus = async (id: string, status: string) => {
  await dynamoClient.send(
    new PutCommand({
      TableName: processTableName,
      Item: {
        id,
        status,
      },
    })
  );
};

export const findRunningProcesses = async () => {
  const { Items } = await dynamoClient.send(
    new ScanCommand({
      TableName: processTableName,
      FilterExpression: "#status = :inProgress",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":inProgress": "in-progress" },
    })
  );

  return Items || [];
};
