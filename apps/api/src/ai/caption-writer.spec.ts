import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { captionPrompt, finishIdeas } from "./caption-writer.js";
import { GeminiCaptionWriter, parseIdeas } from "./gemini.caption-writer.js";

const request = {
  brief: "عرض الجمعة: وجبة عائلية بـ 45 شيكل",
  brand: { name: "برجر هم", language: "ar" as const, voice: "لهجة فلسطينية خفيفة، إيموجي قليل" },
  platforms: ["INSTAGRAM" as const],
  current: null,
};

describe("captionPrompt", () => {
  it("asks for the client's language and platforms, and quotes the agency's words as data", () => {
    const { system, user } = captionPrompt(request);
    expect(system).toMatch(/in Arabic/);
    expect(system).toMatch(/on Instagram/);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/not instructions to you/);
    expect(user).toContain('"""لهجة فلسطينية خفيفة، إيموجي قليل"""');
    expect(user).toContain('"""عرض الجمعة: وجبة عائلية بـ 45 شيكل"""');
    expect(user).not.toMatch(/draft/);
  });

  it("includes the draft to improve when there is one", () => {
    expect(captionPrompt({ ...request, current: "عرض اليوم" }).user).toContain('draft, to improve on: """عرض اليوم"""');
  });
});

describe("finishIdeas", () => {
  it("puts cleaned hashtags after the text: one #, no spaces, no repeats", () => {
    const [caption] = finishIdeas(
      [{ caption: "  عرض الجمعة 🍔 ", hashtags: ["برجر", "#برجر", "##غزة", "أكل غزة", "#!"] }],
      ["FACEBOOK"],
    );
    expect(caption).toBe("عرض الجمعة 🍔\n\n#برجر #غزة #أكل_غزة");
  });

  it("keeps Instagram's 30-hashtag limit, counting the tags already in the text", () => {
    const text = Array.from({ length: 28 }, (_, i) => `#t${i}`).join(" ");
    const [caption] = finishIdeas([{ caption: text, hashtags: ["a", "b", "c", "d"] }], ["INSTAGRAM"]);
    expect(caption.match(/#\w+/g)).toHaveLength(30);
  });

  it("drops empty ideas, and gives at most three", () => {
    const ideas = ["1", "", "2", "3", "4"].map((caption) => ({ caption, hashtags: [] }));
    expect(finishIdeas(ideas, [])).toEqual(["1", "2", "3"]);
  });
});

describe("parseIdeas", () => {
  it("reads the JSON, with or without a ```json fence", () => {
    const json = '{"captions":[{"caption":"x","hashtags":["#a"]}]}';
    expect(parseIdeas(json)).toEqual([{ caption: "x", hashtags: ["#a"] }]);
    expect(parseIdeas("```json\n" + json + "\n```")).toEqual([{ caption: "x", hashtags: ["#a"] }]);
    expect(() => parseIdeas("Sure! Here are some captions")).toThrow();
  });
});

describe("GeminiCaptionWriter", () => {
  const writer = (key?: string) =>
    new GeminiCaptionWriter({
      get: (name: string) => (name === "GEMINI_API_KEY" ? key : "gemini-flash-latest"),
    } as unknown as ConfigService<Env, true>);

  afterEach(() => vi.unstubAllGlobals());

  it("calls generateContent with the key in a header, asks for JSON, and reads the ideas", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"captions":[{"caption":"عرض","hashtags":["#برجر"]}]}' }] } }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await writer("AIza-test-key-0123456789").write(request)).toEqual([{ caption: "عرض", hashtags: ["#برجر"] }]);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect(url).not.toContain("AIza");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test-key-0123456789");
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe("application/json");
  });

  it("an error from Gemini, or an answer that isn't our JSON: 502 AI_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(writer("AIza-test-key-0123456789").write(request)).rejects.toThrow(/didn't answer/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }))));
    await expect(writer("AIza-test-key-0123456789").write(request)).rejects.toThrow(/didn't answer/);
  });

  it("without a key: not configured (503)", async () => {
    expect(writer().configured).toBe(false);
    await expect(writer().write(request)).rejects.toThrow(/aren't set up/);
  });
});
