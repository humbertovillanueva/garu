import type { CompleteRequest, CompleteResponse, ModelProvider } from "../provider.js";

/** A scripted provider for tests: returns the queued responses in order and records what it was asked. */
export class FakeProvider implements ModelProvider {
  readonly id = "fake";
  readonly calls: CompleteRequest[] = [];
  constructor(private readonly script: CompleteResponse[]) {}
  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const { onRetry: _ignored, ...plain } = req;
    this.calls.push(structuredClone(plain) as CompleteRequest); // snapshot: the loop mutates `messages` after the call
    const next = this.script.shift();
    if (!next) throw new Error("FakeProvider: script exhausted");
    return next;
  }
}
