import { describe, expect, it, vi } from "vitest";

import {
  createDataGridCsv,
  type DataGridCsvColumn,
  type DataGridCsvOptions,
  type DataGridCsvValue,
} from "../../../registry/source/systems/data-grid/data-grid-csv.ts";

interface Row {
  readonly active: boolean;
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string | null;
  readonly score?: number;
}

const rows: readonly Row[] = [
  {
    active: true,
    createdAt: new Date("2026-07-20T06:15:30.000Z"),
    id: "first",
    name: "Asha",
    score: 9.5,
  },
  {
    active: false,
    createdAt: new Date("2026-07-21T00:00:00.000Z"),
    id: "second",
    name: null,
  },
];

const columns: readonly DataGridCsvColumn<Row>[] = [
  { id: "name", header: "Name", accessor: (row) => row.name },
  { id: "score", header: "Score", accessor: (row) => row.score },
  { id: "active", header: "Active", accessor: (row) => row.active },
  { id: "created", header: "Created", accessor: (row) => row.createdAt },
];

function unsafeOptions(value: unknown): DataGridCsvOptions<Row> {
  return value as DataGridCsvOptions<Row>;
}

describe("Data Grid CSV serializer", () => {
  it("serializes typed values with deterministic locale-neutral defaults", () => {
    expect(createDataGridCsv({ columns, rows })).toBe(
      [
        "Name,Score,Active,Created",
        "Asha,9.5,true,2026-07-20T06:15:30.000Z",
        ",,false,2026-07-21T00:00:00.000Z",
      ].join("\r\n"),
    );
  });

  it("quotes delimiters, quotes, CR, and LF without changing the supplied content", () => {
    const values = ["comma,value", 'a "quoted" value', "line one\r\nline two", "line\nthree"];
    const textColumns: readonly DataGridCsvColumn<{ readonly value: string }>[] = [
      { id: "value", header: "Text, value", accessor: (row) => row.value },
    ];

    expect(
      createDataGridCsv({
        columns: textColumns,
        rows: values.map((value) => ({ value })),
      }),
    ).toBe(
      [
        '"Text, value"',
        '"comma,value"',
        '"a ""quoted"" value"',
        '"line one\r\nline two"',
        '"line\nthree"',
      ].join("\r\n"),
    );
  });

  it("supports consumer-supplied filtered and selected row models without reordering them", () => {
    const source = [
      { id: "a", state: "ready" },
      { id: "b", state: "draft" },
      { id: "c", state: "ready" },
    ] as const;
    const selectedIds = new Set(["a", "c"]);
    const rowModel = source
      .filter((row) => row.state === "ready" && selectedIds.has(row.id))
      .toReversed();
    const accessor = vi.fn((row: (typeof source)[number], rowIndex: number) =>
      rowIndex === 0 ? row.id.toUpperCase() : row.id,
    );

    expect(
      createDataGridCsv({
        columns: [{ id: "id", header: "ID", accessor }],
        includeHeader: false,
        rows: rowModel,
      }),
    ).toBe("C\r\na");
    expect(accessor.mock.calls).toEqual([
      [source[2], 0],
      [source[0], 1],
    ]);
    expect(source.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("adds formula-injection protection to dangerous text and headers by default", () => {
    const dangerous = [
      "=1+1",
      "+SUM(A1:A2)",
      "-2+3",
      "@command",
      "  =leading-space",
      "\u200B@format-control",
      "\tplain-tab",
      "\rplain-return",
      "\nplain-line-feed",
      "ordinary text",
      "'=already-literal",
    ];
    const formulaColumns: readonly DataGridCsvColumn<{ readonly value: string }>[] = [
      { id: "value", header: "=Untrusted heading", accessor: (row) => row.value },
    ];
    const csv = createDataGridCsv({
      columns: formulaColumns,
      rows: dangerous.map((value) => ({ value })),
    });

    expect(csv.split("\r\n").slice(0, 7)).toEqual([
      "'=Untrusted heading",
      "'=1+1",
      "'+SUM(A1:A2)",
      "'-2+3",
      "'@command",
      "'  =leading-space",
      "'\u200B@format-control",
    ]);
    expect(csv).toContain("'\tplain-tab");
    expect(csv).toContain('"\'\rplain-return"');
    expect(csv).toContain('"\'\nplain-line-feed"');
    expect(csv).toContain("ordinary text");
    expect(csv).toContain("'=already-literal");
  });

  it("can disable formula protection independently and explicitly", () => {
    expect(
      createDataGridCsv({
        columns: [
          { id: "value", header: "=Header", accessor: (row: { value: string }) => row.value },
        ],
        formulaProtection: false,
        rows: [{ value: "=SUM(A1:A2)" }],
      }),
    ).toBe("=Header\r\n=SUM(A1:A2)");
  });

  it("supports deterministic delimiter, newline, header, and BOM configuration", () => {
    interface Pair {
      readonly left: string;
      readonly right: string;
    }
    expect(
      createDataGridCsv({
        columns: [
          { id: "left", header: "Left", accessor: (row: Pair) => row.left },
          { id: "right", header: "Right", accessor: (row: Pair) => row.right },
        ],
        delimiter: ";",
        includeBom: true,
        includeHeader: false,
        newline: "\n",
        rows: [
          { left: "A;1", right: "B" },
          { left: "C", right: "D" },
        ],
      }),
    ).toBe('\uFEFF"A;1";B\nC;D');

    expect(
      createDataGridCsv({
        columns: [
          { id: "value", header: "Value", accessor: (row: { value: string }) => row.value },
        ],
        delimiter: "\t",
        rows: [{ value: "left\tright" }],
      }),
    ).toBe('Value\r\n"left\tright"');
  });

  it("does not treat safe typed negative numbers as injected text", () => {
    const values: readonly DataGridCsvValue[] = [-42, -0, "-42"];
    expect(
      createDataGridCsv({
        columns: [
          {
            id: "value",
            header: "Value",
            accessor: (row: { value: DataGridCsvValue }) => row.value,
          },
        ],
        rows: values.map((value) => ({ value })),
      }),
    ).toBe("Value\r\n-42\r\n0\r\n'-42");
  });

  it("fails closed for malformed containers, columns, and unsafe configuration", () => {
    const valid = { columns, rows };
    const invalidOptions: readonly unknown[] = [
      null,
      [],
      { ...valid, rows: {} },
      { ...valid, columns: [] },
      { ...valid, columns: [null] },
      { ...valid, columns: [{ id: "", header: "Name", accessor: () => "A" }] },
      {
        ...valid,
        columns: [
          { id: "same", header: "First", accessor: () => "A" },
          { id: "same", header: "Second", accessor: () => "B" },
        ],
      },
      { ...valid, columns: [{ id: "name", header: " ", accessor: () => "A" }] },
      { ...valid, columns: [{ id: "name", header: "Name", accessor: "name" }] },
      { ...valid, delimiter: ":" },
      { ...valid, delimiter: '"' },
      { ...valid, delimiter: "\r" },
      { ...valid, newline: "\r" },
      { ...valid, formulaProtection: true },
      { ...valid, formulaProtection: "none" },
      { ...valid, includeBom: "yes" },
      { ...valid, includeHeader: 1 },
    ];

    for (const value of invalidOptions) {
      expect(() => createDataGridCsv(unsafeOptions(value))).toThrowError(/Mergora Data Grid CSV/u);
    }
  });

  it("rejects non-finite numbers, invalid dates, and unsupported accessor values", () => {
    const invalidValues: readonly unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      new Date(Number.NaN),
      1n,
      Symbol("value"),
      { nested: true },
      ["value"],
    ];

    for (const value of invalidValues) {
      expect(() =>
        createDataGridCsv({
          columns: [
            {
              id: "value",
              header: "Value",
              accessor: () => value as DataGridCsvValue,
            },
          ],
          rows: [{}],
        }),
      ).toThrowError(/column "value" returned/u);
    }
  });

  it("propagates accessor errors without emitting partial output", () => {
    const failure = new Error("consumer accessor failed");
    expect(() =>
      createDataGridCsv({
        columns: [
          {
            id: "value",
            header: "Value",
            accessor: () => {
              throw failure;
            },
          },
        ],
        rows: [{}],
      }),
    ).toThrow(failure);
  });

  it("handles empty supplied models deterministically", () => {
    expect(createDataGridCsv({ columns, rows: [] })).toBe("Name,Score,Active,Created");
    expect(createDataGridCsv({ columns, includeHeader: false, rows: [] })).toBe("");
    expect(createDataGridCsv({ columns, includeBom: true, includeHeader: false, rows: [] })).toBe(
      "\uFEFF",
    );
  });
});
