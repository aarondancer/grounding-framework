import { GraphQLScalarType, Kind, type ValueNode } from "graphql";

function astToValue(node: ValueNode): unknown {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.BOOLEAN:
      return node.value;
    case Kind.INT:
      return Number.parseInt(node.value, 10);
    case Kind.FLOAT:
      return Number.parseFloat(node.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map(astToValue);
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {};
      for (const field of node.fields) obj[field.name.value] = astToValue(field.value);
      return obj;
    }
    default:
      return undefined;
  }
}

/** Arbitrary JSON values; context objects are JSON scalars (spec/09). */
export const JSONScalar = new GraphQLScalarType<unknown, unknown>({
  name: "JSON",
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: astToValue,
});

export const DateTimeScalar = new GraphQLScalarType<Date, string>({
  name: "DateTime",
  serialize: (v) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString()),
  parseValue: (v) => new Date(String(v)),
  parseLiteral: (node) => {
    if (node.kind !== Kind.STRING) {
      throw new TypeError("DateTime must be a string literal");
    }
    return new Date(node.value);
  },
});

/** Long integers serialize as decimal strings to avoid precision loss. */
export const LongScalar = new GraphQLScalarType<bigint | number, string>({
  name: "Long",
  serialize: (v) => String(v),
  parseValue: (v) => BigInt(String(v)),
  parseLiteral: (node) => {
    if (node.kind !== Kind.INT && node.kind !== Kind.STRING) {
      throw new TypeError("Long must be an int or string literal");
    }
    return BigInt(node.value);
  },
});
