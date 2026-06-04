import * as matchers from "@testing-library/jest-dom/matchers"
import { expect } from "vitest"
expect.extend(matchers)

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {}
}
