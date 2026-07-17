import { runToolExecutionExample } from "./runToolExecutionExample.js";

runToolExecutionExample().catch((error: unknown) => {
  console.error("The tool execution example failed.", error);
  process.exitCode = 1;
});
