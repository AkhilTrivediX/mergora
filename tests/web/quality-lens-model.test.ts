import { describe, expect, it } from "vitest";

import {
  compositeColor,
  contrastRatio,
  parseCssColor,
  parseQualityLensModes,
} from "../../apps/web/src/app/quality-lens-model.ts";

describe("Quality Lens deterministic measurements", () => {
  it("parses browser RGB and canonical OKLCH colors", () => {
    expect(parseCssColor("rgb(255 0 127 / 50%)")).toEqual({
      alpha: 0.5,
      blue: 127 / 255,
      green: 0,
      red: 1,
    });
    expect(parseCssColor("transparent")).toEqual({ alpha: 0, blue: 0, green: 0, red: 0 });
    expect(parseCssColor("oklch(100% 0 0)")).toMatchObject({
      alpha: 1,
      blue: expect.closeTo(1, 5),
      green: expect.closeTo(1, 5),
      red: expect.closeTo(1, 5),
    });
    expect(parseCssColor("linear-gradient(red, blue)")).toBeNull();
  });

  it("measures contrast after alpha composition", () => {
    const white = parseCssColor("rgb(255 255 255)")!;
    const black = parseCssColor("rgb(0 0 0)")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(compositeColor(parseCssColor("rgb(0 0 0 / 50%)")!, white)).toEqual({
      alpha: 1,
      blue: 0.5,
      green: 0.5,
      red: 0.5,
    });
  });

  it("normalizes URL modes and reports unknown state without dropping valid layers", () => {
    expect(parseQualityLensModes(null)).toEqual({ invalid: [], modes: ["focus-order"] });
    expect(parseQualityLensModes("contrast,focus-order,contrast,unknown")).toEqual({
      invalid: ["unknown"],
      modes: ["contrast", "focus-order"],
    });
    expect(parseQualityLensModes("unknown")).toEqual({
      invalid: ["unknown"],
      modes: ["focus-order"],
    });
  });
});
