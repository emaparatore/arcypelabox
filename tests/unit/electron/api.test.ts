import { describe, it, expect } from "vitest"
import { getErrorMessage } from "../../../electron/api.js"

describe("getErrorMessage", () => {
  it("maps Docker ENOENT to friendly message", () => {
    const err = new Error("connect ENOENT //./pipe/docker_engine")
    const result = getErrorMessage(err)
    expect(result).toContain("Docker Desktop is not running")
    expect(result).toContain("Start Docker Desktop")
  })

  it("does not map Unix socket ENOENT (only Windows pipe)", () => {
    const err = new Error("connect ENOENT /var/run/docker.sock")
    const result = getErrorMessage(err)
    expect(result).toBe("connect ENOENT /var/run/docker.sock")
  })

  it("passes through other error messages", () => {
    const err = new Error("Something went wrong")
    const result = getErrorMessage(err)
    expect(result).toBe("Something went wrong")
  })

  it("handles non-Error arguments", () => {
    const result = getErrorMessage("string error")
    expect(result).toBe("string error")
  })

  it("handles null/undefined-like errors", () => {
    const result = getErrorMessage(null)
    expect(result).toBe("null")
  })
})
