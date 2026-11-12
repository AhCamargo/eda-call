import { describe, it, expect } from "vitest";
import { normalizeBrPhone, formatBrPhone } from "./phone";

describe("normalizeBrPhone", () => {
  it.each([
    ["44999998888", "5544999998888", true],
    ["044999998888", "5544999998888", true],
    ["01544999998888", "5544999998888", true],
    ["5544999998888", "5544999998888", true],
    ["+55 (44) 99999-8888", "5544999998888", true],
    ["4430001234", "554430001234", false],
    ["4488887777", "5544988887777", true], // celular antigo ganha o 9
  ])("%s → %s", (raw, digits, mobile) => {
    expect(normalizeBrPhone(raw)).toMatchObject({ digits, isMobile: mobile });
  });

  it("número local sem DDD usa o DDD padrão", () => {
    expect(normalizeBrPhone("999998888", "44")?.digits).toBe("5544999998888");
    expect(normalizeBrPhone("999998888")).toBeNull();
  });

  it("recusa oculto, ramal e lixo", () => {
    for (const raw of ["", "anonymous", "2001", "123", "00000000000", "4419999888"]) {
      expect(normalizeBrPhone(raw, "44")).toBeNull();
    }
  });

  it("formata para exibição", () => {
    expect(formatBrPhone("5544999998888")).toBe("(44) 99999-8888");
  });
});
