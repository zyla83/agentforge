<p align="center">
  <img src="../../asstets/brand/agentforge-mark.svg" alt="AgentForge whisper.cpp client" width="96" height="96">
</p>

# @agentforge/whisper-client

A narrow local process adapter that transcribes one existing WAV file with an
explicitly configured `whisper-cli` executable and compatible GGML model.

```ts
import { WhisperClient } from "@agentforge/whisper-client";

const client = new WhisperClient({
  executable: "<absolute-whisper-cli-path>",
  model: "<absolute-multilingual-model.bin>",
  language: "auto",
});

const result = await client.transcribe({
  inputFile: "<absolute-input.wav>",
  outputPrefix: "<fresh-absolute-output-prefix>",
});
```

The adapter spawns the executable directly with `shell: false`, accepts no
arbitrary CLI flags, performs no retry, and reads only one bounded UTF-8 text
output. It does not capture a microphone, download software or models, persist
audio or transcripts, or execute an LLM or tool.

Download a prebuilt whisper.cpp Windows package and a licensed model separately
through the canonical
[local microphone and STT guide](../../docs/INSTALLATION.md#optional-local-microphone-and-stt-setup).
