import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Value } from "@sinclair/typebox/value";
import * as sdkHelpers from "@ubiquity-os/plugin-sdk/helpers";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import * as localRetry from "../src/helpers/retry";
import { ContentEvaluatorModule } from "../src/parser/content-evaluator-module";
import { ContextPlugin, pluginSettingsSchema } from "../src/types/plugin-input";

describe("Retry and OpenRouter model token limits (#330)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-exports retry and checkLlmRetryableState directly from @ubiquity-os/plugin-sdk/helpers", () => {
    expect(localRetry.retry).toBe(sdkHelpers.retry);
    expect(localRetry.checkLlmRetryableState).toBe(sdkHelpers.checkLlmRetryableState);
    expect(localRetry.getOpenRouterModelTokenLimits).toBe(sdkHelpers.getOpenRouterModelTokenLimits);
  });

  it("uses OpenRouter API model token limits to determine chunk size in ContentEvaluatorModule", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "deepseek/deepseek-chat",
              context_length: 320,
              top_provider: {
                context_length: 320,
                max_completion_tokens: 128,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const config = Value.Default(pluginSettingsSchema, {
      incentives: {
        contentEvaluator: {
          openAi: {
            model: "deepseek/deepseek-chat",
            tokenCountLimit: 124000,
          },
        },
      },
    });

    const context = {
      config,
      logger: new Logs("debug"),
      payload: {
        issue: { user: { login: "spec-author" } },
      },
    } as unknown as ContextPlugin;

    const evaluator = new ContentEvaluatorModule(context);
    jest.spyOn(evaluator, "computePriority").mockResolvedValue(1);

    await evaluator.transform({ self: { body: "Issue specification" } } as never, {});

    expect(fetchSpy).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models");
    expect(evaluator["_tokenLimit"]).toBe(320);
    expect(evaluator["_maxCompletionTokens"]).toBe(128);
  });
});
