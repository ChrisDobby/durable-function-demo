import { withDurableExecution } from "@aws/durable-execution-sdk-js";

import { createProcess, findRunningProcesses, setProcessStatus } from "./process";
import { sendApproval } from "./approval";
import { commandOne, commandTwo } from "./command";

export const handler = withDurableExecution(async (_, context) => {
  const processId = await context.step("create process", async (stepContext) => {
    stepContext.logger.info("creating new process");
    return await createProcess();
  });

  try {
    const userApproval = await context.waitForCallback(
      "ask for approval",
      async (callbackId) => {
        await sendApproval(callbackId);
      },
      {
        timeout: { hours: 1 },
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

    if (!haveAllProcessesFinished) {
      throw new Error("Processes not finished in a timely manner");
    }

    await context.step("start process", async () => {
      await setProcessStatus(processId, "in-progress");
    });

    const commandResults = await context.parallel("run commands", [
      async (parallelContext) => {
        await parallelContext.waitForCallback(
          "command one",
          async (callbackId) => {
            await commandOne(callbackId);
          },
          {
            timeout: { hours: 1 },
          }
        );
      },
      async (parallelContext) => {
        await parallelContext.waitForCallback(
          "command two",
          async (callbackId) => {
            await commandTwo(callbackId);
          },
          {
            timeout: { hours: 1 },
          }
        );
      },
    ]);

    context.logger.info("commands completed", commandResults);
    const failedCommands = commandResults.all.filter((result) => result.status === "FAILED");
    if (failedCommands.length) {
      throw new Error(`${processId} failed ${JSON.stringify(failedCommands, null, 2)}`);
    }

    await context.step("complete process", async () => {
      await setProcessStatus(processId, "completed");
    });

    return { processId, status: "success" };
  } catch (error) {
    context.logger.error(error);
    await setProcessStatus(processId, "failed");
    throw error;
  }
});
