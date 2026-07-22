<p align="center">
  <img src="../../asstets/brand/agentforge-mark.svg" alt="AgentForge Piper client" width="96" height="96">
</p>

# @agentforge/piper-client

A narrow local process adapter for synthesizing one WAV file with a trusted,
user-installed Piper executable and compatible ONNX voice model.

Install Piper and retrieve a licensed voice separately through the canonical
[Piper setup guide](../../docs/INSTALLATION.md#optional-piper-tts-setup).
AgentForge does not download or trust these external files on the user's
behalf.

```ts
import { PiperClient } from "@agentforge/piper-client";

const client = new PiperClient({
  executable: "C:\\trusted-tools\\piper\\piper.exe",
  model: "C:\\trusted-voices\\voice.onnx",
});

await client.synthesize({
  text: "Local speech output is ready.",
  outputFile: "C:\\temporary-directory\\speech.wav",
});
```

The client spawns Piper directly with `shell: false`, passes text only through
stdin as UTF-8, validates a non-existing absolute output target, and accepts
success only when Piper exits with code zero and creates a non-empty RIFF/WAVE
file. It does not download Piper or voices, play audio, cache output, retry
synthesis, expose generic process execution, or provide speech-to-text.

Configuration requires explicit absolute paths to existing regular files. The
model must end in `.onnx`; an optional explicit config must end in
`.onnx.json`. If config is omitted, Piper may use its normal adjacent-model
configuration. Synthesis accepts non-empty spoken text up to 16,000 UTF-16 code
units, a fresh absolute `.wav` target in an existing directory, an optional
`AbortSignal`, and an integer timeout from 1 through 600,000 milliseconds. The
default timeout is 120,000 milliseconds.

The configured executable runs with the host application's user privileges.
Callers own temporary-directory creation, playback, and deletion. Removing a
temporary file is best-effort cleanup, not secure erasure.
