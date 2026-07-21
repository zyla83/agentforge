<p align="center">
  <img src="../../asstets/brand/package-icons/provider-mock.svg" alt="AgentForge mock provider package icon" width="96" height="96">
</p>

# @agentforge/provider-mock

A deterministic LLM provider for tests, examples, and local development. It can
return configured complete responses, stream configured deltas, expose a fixed
health result, and record immutable request snapshots.

```ts
import { MockLLMProvider } from "@agentforge/provider-mock";

const provider = new MockLLMProvider({
  responseContent: "Hello from the mock provider.",
});
```

This package performs no network requests and is not intended to simulate the
full behavior or failure modes of a production model service.
