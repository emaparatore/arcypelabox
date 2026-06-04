import { describe, it, expect } from "vitest"
import { getPipePath, pathToRegex } from "../../../electron/ipc-server.js"

describe("getPipePath", () => {
  it("returns a non-empty string", () => {
    const result = getPipePath("test-service")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })
})

describe("pathToRegex", () => {
  it("converts static path to exact regex", () => {
    const { regex, paramNames } = pathToRegex("/api/ping")
    expect(regex.test("/api/ping")).toBe(true)
    expect(regex.test("/api/ping/")).toBe(false)
    expect(regex.test("/api/pong")).toBe(false)
    expect(paramNames).toEqual([])
  })

  it("extracts parameter names from path", () => {
    const { regex, paramNames } = pathToRegex("/api/sandboxes/:id/info")
    expect(paramNames).toEqual(["id"])
    const match = "/api/sandboxes/abc-123/info".match(regex)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("abc-123")
  })

  it("handles multiple parameters", () => {
    const { regex, paramNames } = pathToRegex("/api/:resource/:action")
    expect(paramNames).toEqual(["resource", "action"])
    const match = "/api/sandboxes/create".match(regex)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("sandboxes")
    expect(match![2]).toBe("create")
  })

  it("rejects paths that do not match", () => {
    const { regex } = pathToRegex("/api/sandboxes/:id/info")
    expect(regex.test("/api/sandboxes/123/info/extra")).toBe(false)
    expect(regex.test("/api/other/123/info")).toBe(false)
  })

  it("decodes URI components in matched parameters", () => {
    const { regex, paramNames } = pathToRegex("/api/:id/status")
    expect(paramNames).toEqual(["id"])
    const match = "/api/hello%20world/status".match(regex)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("hello%20world")
  })
})
