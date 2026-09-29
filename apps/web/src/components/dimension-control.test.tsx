import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { createAppStore, simulatedContext } from "../lib/store";
import { DimensionControl } from "./dimension-control";

afterEach(cleanup);

const base = {
  key: "roles",
  trust: "client",
  valueType: "enum",
  cardinality: "single",
};

function mount(dim: typeof base & { values?: { nodes: { key: string; name: string | null }[] } }) {
  const store = createAppStore();
  const view = render(
    <Provider store={store}>
      <DimensionControl dim={dim} />
    </Provider>,
  );
  return { store, view };
}

describe("DimensionControl", () => {
  test("server-trusted dimensions are not editable", () => {
    const { view } = mount({ ...base, trust: "server" });
    expect(view.getByText(/server-trusted/)).toBeTruthy();
    expect(view.container.querySelector("input,select")).toBeNull();
  });

  test("enum single renders a value select and commits to the store", () => {
    const { store, view } = mount({
      ...base,
      values: { nodes: [{ key: "manager", name: "Manager" }] },
    });
    const select = view.container.querySelector("select");
    expect(select).toBeTruthy();
    expect(view.getByText("Manager")).toBeTruthy();
    fireEvent.change(select as Element, { target: { value: "manager" } });
    expect(store.getState().simulatedContext.values.roles).toBe("manager");
  });

  test("enum multi renders a checkbox per value", () => {
    const { store, view } = mount({
      ...base,
      cardinality: "multi",
      values: {
        nodes: [
          { key: "a", name: null },
          { key: "b", name: null },
        ],
      },
    });
    const boxes = view.container.querySelectorAll("input[type=checkbox]");
    expect(boxes.length).toBe(2);
    fireEvent.click(boxes[0] as Element);
    expect(store.getState().simulatedContext.values.roles).toEqual(["a"]);
  });

  test("string control renders current value; clear button removes the key", () => {
    const store = createAppStore();
    store.dispatch(simulatedContext.setValue({ key: "rank", value: "3" }));
    const view = render(
      <Provider store={store}>
        <DimensionControl
          dim={{ key: "rank", trust: "client", valueType: "string", cardinality: "single" }}
        />
      </Provider>,
    );
    const input = view.container.querySelector("input") as HTMLInputElement | null;
    expect(input?.value).toBe("3");
    // NB: React's synthetic onChange for text inputs does not dispatch under
    // happy-dom (select/checkbox work) — the clear button exercises the same
    // remove-from-context path.
    fireEvent.click(view.getByTitle("clear"));
    expect(store.getState().simulatedContext.values.rank).toBeUndefined();
  });
});
