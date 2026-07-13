import { z } from "zod";

export const AgentForgeConfigSchema = z.strictObject({
  instanceName: z.string().trim().min(1).default("default"),
  plugins: z.record(z.string(), z.unknown()).default({}),
});

export type AgentForgeConfig = z.infer<typeof AgentForgeConfigSchema>;
export type AgentForgeConfigInput = z.input<typeof AgentForgeConfigSchema>;
