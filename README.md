# durable-function-demo

This is a project designed as a demo of workflow orchestration using [Lambda Durable Functions]()

To deploy the solution:

```
npm ci
npm run deploy
```

This will deploy the following components:

`durable-function-demo-process` Dynamo table to store workflow progress
`durable-function-demo-command` SQS to issue commands
`durable-function-demo-workflow-role` IAM role
`durable-function-demo-workflow` Lambda Durable Function to orchestrate the workflow

The following components are deployed to 'mock' functionality:

`durable-function-demo-dummy-customer` SNS topic used to mock a user approval
`durable-function-demo-callback-api` Lambda function with URL used to send a callback notification to the durable function
`durable-function-demo-callback-api-role` IAM role for the above function
`durable-function-demo-command` Lambda function with URL used to schedule callbacks to mock a command being complete
`durable-function-demo-command-role` IAM role for the above function
`durable-function-demo-scheduler-role` IAM role used by the scheduler
