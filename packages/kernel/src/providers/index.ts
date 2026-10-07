import type { ModelProvider } from "../provider.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";

export type ProviderFactory = () => ModelProvider;

const registry = new Map<string, ProviderFactory>([
  ["anthropic", () => new AnthropicProvider()],
  ["gemini", () => new GeminiProvider()],
]);

export function registerProvider(id: string, make: ProviderFactory): void {
  registry.set(id, make);
}

export function getProvider(id: string): ModelProvider {
  const make = registry.get(id);
  if (!make) {
    throw new Error(`unknown model provider "${id}". Known: ${[...registry.keys()].join(", ")}`);
  }
  return make();
}

export { AnthropicProvider } from "./anthropic.js";
export { FakeProvider } from "./fake.js";
export { GeminiProvider } from "./gemini.js";
