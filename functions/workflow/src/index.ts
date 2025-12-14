import { withDurableExecution } from "@aws/durable-execution-sdk-js";

import { createProcess, findRunningProcesses, setProcessStatus } from "./process";
import { sendApproval } from "./approval";
import { commandOne, commandTwo } from "./command";
import { executeOnce } from "./idempotency";
import { HttpError, transientErrorStatuses } from "./httpError";

const retryStrategy = (_: unknown, attempt: number) => ({
  shouldRetry: attempt <= 3,
  delay: { minutes: attempt * 2 },
});

export const handler = withDurableExecution(async (_, context) => {
  const processId = await context.step(
    "create process",
    async (stepContext) => {
      stepContext.logger.info("creating new process");
      return await createProcess();
    },
    {
      retryStrategy,
    }
  );

  try {
    const userApproval = await context.waitForCallback(
      "ask for approval",
      async (callbackId) => {
        await sendApproval(callbackId);
      },
      {
        timeout: { hours: 1 },
        retryStrategy,
      }
    );

    context.logger.info("user approval received", userApproval);
    if (!userApproval || !JSON.parse(userApproval).approved) {
      throw new Error("No user approval");
    }

    const haveAllProcessesFinished = await context.waitForCondition(
      "check for running processes",
      async () => {
        const runningProcesses = await findRunningProcesses();
        return runningProcesses.length === 0;
      },
      {
        initialState: false,
        waitStrategy: (state, attempt) => ({
          shouldContinue: !state && attempt <= 10,
          delay: { minutes: 10 },
        }),
      }
    );

    context.logger.info("all processes finished", { haveAllProcessesFinished });
    if (!haveAllProcessesFinished) {
      throw new Error("Processes not finished in a timely manner");
    }

    await context.step(
      "start process",
      async () => {
        await setProcessStatus(processId, "in-progress");
      },
      {
        retryStrategy,
      }
    );

    const commandResults = await context.parallel("run commands", [
      async (parallelContext) => {
        await parallelContext.waitForCallback(
          "command one",
          async (callbackId) => {
            await executeOnce(processId, "commandOne", async () => commandOne(callbackId));
          },
          {
            timeout: { hours: 1 },
            retryStrategy,
          }
        );
      },
      async (parallelContext) => {
        await parallelContext.waitForCallback(
          "command two",
          async (callbackId) => {
            await executeOnce(processId, "commandTwo", async () => commandTwo(callbackId));
          },
          {
            timeout: { hours: 1 },
            retryStrategy: (error, attempt) => {
              const httpError = error as HttpError;
              return {
                shouldRetry: httpError.status
                  ? transientErrorStatuses.includes(httpError.status) && attempt <= 5
                  : attempt <= 5,
                delay: { minutes: 5 * attempt },
              };
            },
          }
        );
      },
    ]);

    context.logger.info("commands completed", commandResults);
    if (commandResults.completionReason !== "ALL_COMPLETED") {
      throw new Error(`${processId} failed ${JSON.stringify(commandResults.failed(), null, 2)}`);
    }

    await context.step(
      "complete process",
      async () => {
        await setProcessStatus(processId, "completed");
      },
      {
        retryStrategy,
      }
    );

    return { processId, status: "success" };
  } catch (error) {
    context.logger.error(error);
    await setProcessStatus(processId, "failed");
    throw error;
  }
});
