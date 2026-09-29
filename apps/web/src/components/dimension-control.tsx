import { useSimulatedContext } from "../lib/sim-context";

const cls = "w-full rounded border border-zinc-300 px-2 py-1 text-sm";

/**
 * Dynamic context-simulator control driven by valueType/cardinality
 * (spec/10). Used by the dimensions list and detail page; `values` is only
 * populated for enum dimensions, so it stays optional.
 */
export function DimensionControl({
  dim,
}: {
  dim: {
    key: string;
    trust: string;
    valueType: string;
    cardinality: string;
    values?: { nodes: { key: string; name: string | null }[] } | null;
  };
}) {
  const { context, set, remove } = useSimulatedContext();
  const value = context[dim.key];
  const commit = (v: unknown) => (v === undefined ? remove(dim.key) : set(dim.key, v));
  const clear =
    value !== undefined ? (
      <button
        type="button"
        onClick={() => remove(dim.key)}
        className="text-xs text-zinc-400 hover:text-zinc-700"
        title="clear"
      >
        ✕
      </button>
    ) : null;

  if (dim.trust === "server") {
    return (
      <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-400">
        server-trusted — set by the host, not editable here
      </div>
    );
  }

  if (dim.valueType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => commit(e.target.checked ? true : undefined)}
        />
        {clear}
      </div>
    );
  }

  const enumValues = dim.values?.nodes ?? [];
  if (dim.valueType === "enum" && enumValues.length > 0) {
    if (dim.cardinality === "multi") {
      const current = Array.isArray(value)
        ? value.map(String)
        : value === undefined
          ? []
          : [String(value)];
      return (
        <div className="flex flex-wrap items-center gap-2">
          {enumValues.map((v) => (
            <label key={v.key} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={current.includes(v.key)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...current, v.key]
                    : current.filter((k) => k !== v.key);
                  commit(next.length > 0 ? next : undefined);
                }}
              />
              {v.name ?? v.key}
            </label>
          ))}
          {clear}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <select
          className={cls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => commit(e.target.value === "" ? undefined : e.target.value)}
        >
          <option value="">(unset)</option>
          {enumValues.map((v) => (
            <option key={v.key} value={v.key}>
              {v.name ?? v.key}
            </option>
          ))}
        </select>
        {clear}
      </div>
    );
  }

  if (dim.valueType === "number") {
    return (
      <div className="flex items-center gap-2">
        <input
          className={cls}
          type="number"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => commit(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {clear}
      </div>
    );
  }

  // string (and enum without loaded values): free text; multi = comma list.
  const current = value === undefined ? "" : Array.isArray(value) ? value.join(",") : String(value);
  return (
    <div className="flex items-center gap-2">
      <input
        className={cls}
        value={current}
        placeholder={
          dim.cardinality === "multi" ? `comma-separated ${dim.valueType} values` : "value"
        }
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return commit(undefined);
          commit(
            dim.cardinality === "multi"
              ? raw
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : raw,
          );
        }}
      />
      {clear}
    </div>
  );
}
