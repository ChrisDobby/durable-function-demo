import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const snsClient = new SNSClient();

export const sendApproval = async (callbackId: string) => {
  await snsClient.send(
    new PublishCommand({
      TopicArn: process.env.APPROVAL_TOPIC_ARN,
      Message: `${process.env.APPROVAL_API_URL}?callbackId=${callbackId}`,
    })
  );
};
