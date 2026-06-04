import { describe, it, expect } from "vitest"
import { getPipePath } from "../../../electron/ipc-client.js"

describe("getPipePath (client)", () => {
  it("returns a non-empty string", () => {
    const result = getPipePath("test-service")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })
})
