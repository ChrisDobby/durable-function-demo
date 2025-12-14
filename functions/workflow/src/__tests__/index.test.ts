import {
  LocalDurableTestRunner,
  WaitingOperationStatus,
} from "@aws/durable-execution-sdk-js-testing";

import { handler } from "../index";
import { createProcess, findRunningProcesses, setProcessStatus } from "../process";
import { executeOnce } from "../idempotency";

const processId = "1-2-3-4-5";

jest.mock("../process");
jest.mock("../approval");
jest.mock("../idempotency");

const mockCreateProcess = createProcess as jest.MockedFunction<typeof createProcess>;
const mockFindRunningProcesses = findRunningProcesses as jest.MockedFunction<
  typeof findRunningProcesses
>;
const mockExecutOnce = executeOnce as jest.MockedFunction<typeof executeOnce>;

beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));

afterAll(LocalDurableTestRunner.teardownTestEnvironment);

describe("workflow", () => {
  const runner = new LocalDurableTestRunner({ handlerFunction: handler });

  beforeEach(() => {
    runner.reset();
    jest.clearAllMocks();
  });

  it("should complete workflow successfully", async () => {
    mockCreateProcess.mockResolvedValue(processId);
    mockFindRunningProcesses.mockResolvedValue([]);
    mockExecutOnce.mockResolvedValue();

    const executionPromise = runner.run();

    const approvalCallback = runner.getOperation("ask for approval");
    await approvalCallback.waitForData(WaitingOperationStatus.STARTED);
    approvalCallback.sendCallbackSuccess(JSON.stringify({ approved: true }));

    const commandOneCallback = runner.getOperation("command one");
    await commandOneCallback.waitForData(WaitingOperationStatus.STARTED);
    commandOneCallback.sendCallbackSuccess();

    const commandTwoCallback = runner.getOperation("command two");
    await commandTwoCallback.waitForData(WaitingOperationStatus.STARTED);
    commandTwoCallback.sendCallbackSuccess();

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe("SUCCEEDED");

    const createProcessOperation = runner.getOperation("create process");
    expect(createProcessOperation.getStepDetails()?.result).toBe(processId);
    expect(createProcess).toHaveBeenCalledTimes(1);

    const checkRunningProcessesOperation = runner.getOperation("check for running processes");
    expect(checkRunningProcessesOperation.getStepDetails()?.result).toBe(true);
    expect(findRunningProcesses).toHaveBeenCalledTimes(1);

    const startProcessOperation = runner.getOperation("start process");
    expect(startProcessOperation.getStepDetails()?.result).toBeUndefined();
    expect(setProcessStatus).toHaveBeenCalledWith(processId, "in-progress");

    const completeProcessOperation = runner.getOperation("complete process");
    expect(completeProcessOperation.getStepDetails()?.result).toBeUndefined();
    expect(setProcessStatus).toHaveBeenCalledWith(processId, "completed");
  });

  it("should fail if approval rejected", async () => {
    mockCreateProcess.mockResolvedValue(processId);

    const executionPromise = runner.run();

    const approvalCallback = runner.getOperation("ask for approval");
    await approvalCallback.waitForData(WaitingOperationStatus.STARTED);
    approvalCallback.sendCallbackFailure();

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe("FAILED");
  });

  it("should fail if commandOne rejected", async () => {
    mockCreateProcess.mockResolvedValue(processId);
    mockFindRunningProcesses.mockResolvedValue([]);
    mockExecutOnce.mockResolvedValue();

    const executionPromise = runner.run();

    const approvalCallback = runner.getOperation("ask for approval");
    await approvalCallback.waitForData(WaitingOperationStatus.STARTED);
    approvalCallback.sendCallbackSuccess(JSON.stringify({ approved: true }));

    const commandOneCallback = runner.getOperation("command one");
    await commandOneCallback.waitForData(WaitingOperationStatus.STARTED);
    commandOneCallback.sendCallbackFailure();

    const commandTwoCallback = runner.getOperation("command two");
    await commandTwoCallback.waitForData(WaitingOperationStatus.STARTED);
    commandTwoCallback.sendCallbackSuccess();

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe("FAILED");
  });

  it("should fail if commandTwo rejected", async () => {
    mockCreateProcess.mockResolvedValue(processId);
    mockFindRunningProcesses.mockResolvedValue([]);
    mockExecutOnce.mockResolvedValue();

    const executionPromise = runner.run();

    const approvalCallback = runner.getOperation("ask for approval");
    await approvalCallback.waitForData(WaitingOperationStatus.STARTED);
    approvalCallback.sendCallbackSuccess(JSON.stringify({ approved: true }));

    const commandOneCallback = runner.getOperation("command one");
    await commandOneCallback.waitForData(WaitingOperationStatus.STARTED);
    commandOneCallback.sendCallbackSuccess();

    const commandTwoCallback = runner.getOperation("command two");
    await commandTwoCallback.waitForData(WaitingOperationStatus.STARTED);
    commandTwoCallback.sendCallbackFailure();

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe("FAILED");
  });

  it("should fail if running processes do not complete", async () => {
    mockCreateProcess.mockResolvedValue(processId);
    mockFindRunningProcesses.mockResolvedValue([{ processId: "1" }]);

    const executionPromise = runner.run();

    const approvalCallback = runner.getOperation("ask for approval");
    await approvalCallback.waitForData(WaitingOperationStatus.STARTED);
    approvalCallback.sendCallbackSuccess(JSON.stringify({ approved: true }));

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe("FAILED");
  });

  it("should complete if create process fails once", async () => {
    mockCreateProcess.mockRejectedValueOnce(new Error()).mockResolvedValue(processId);
    mockFindRunningProcesses.mockResolvedValue([]);
    mockExecutOnce.mockResolvedValue();

    const executionPromise = runner.run();

    const approvalCallback = runner.getOperation("ask for approval");
    await approvalCallback.waitForData(WaitingOperationStatus.STARTED);
    approvalCallback.sendCallbackSuccess(JSON.stringify({ approved: true }));

    const commandOneCallback = runner.getOperation("command one");
    await commandOneCallback.waitForData(WaitingOperationStatus.STARTED);
    commandOneCallback.sendCallbackSuccess();

    const commandTwoCallback = runner.getOperation("command two");
    await commandTwoCallback.waitForData(WaitingOperationStatus.STARTED);
    commandTwoCallback.sendCallbackSuccess();

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe("SUCCEEDED");
  });
});
