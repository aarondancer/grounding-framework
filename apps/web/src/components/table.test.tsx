import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { DataTable } from "./table";

afterEach(cleanup);

describe("DataTable", () => {
  test("renders headers and one row per item", () => {
    const { getByText, getAllByRole } = render(
      <DataTable
        rows={[
          { key: "a", n: 1 },
          { key: "b", n: 2 },
        ]}
        cols={[
          { key: "key", header: "Key", cell: (r) => r.key },
          { key: "n", header: "N", cell: (r) => r.n * 10 },
        ]}
      />,
    );
    expect(getByText("Key")).toBeTruthy();
    expect(getByText("20")).toBeTruthy();
    // header row + 2 data rows
    expect(getAllByRole("row").length).toBe(3);
  });

  test("empty row set renders header only", () => {
    const { getAllByRole } = render(
      <DataTable rows={[]} cols={[{ key: "k", header: "K", cell: () => "x" }]} />,
    );
    expect(getAllByRole("row").length).toBe(1);
  });
});
