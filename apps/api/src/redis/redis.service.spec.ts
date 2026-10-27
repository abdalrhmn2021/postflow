import { describeError } from "./redis.service.js";

describe("describeError", () => {
  it("uses the error's own message when it has one", () => {
    expect(describeError(new Error("connect ECONNREFUSED 127.0.0.1:6379"))).toBe("connect ECONNREFUSED 127.0.0.1:6379");
  });

  it("reads the codes inside a Windows AggregateError, whose message is empty", () => {
    const err = new AggregateError(
      [Object.assign(new Error(""), { code: "ECONNREFUSED" }), Object.assign(new Error(""), { code: "ECONNREFUSED" })],
      "",
    );
    expect(describeError(err)).toBe("ECONNREFUSED");
  });
});
