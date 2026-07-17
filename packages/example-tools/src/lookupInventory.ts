import {
  type JsonValue,
  type ToolArguments,
  type ToolExecutionContext,
  createToolDefinition,
} from "@agentforge/provider-sdk";

export interface LookupInventoryArguments extends ToolArguments {
  readonly sku: string;
  readonly includeWarehouses?: boolean;
}

export interface InventoryWarehouse
  extends Readonly<Record<string, JsonValue>> {
  readonly code: string;
  readonly available: number;
}

export interface LookupInventoryOutput
  extends Readonly<Record<string, JsonValue>> {
  readonly sku: string;
  readonly name: string;
  readonly available: number;
  readonly inStock: boolean;
  readonly warehouses?: readonly Readonly<InventoryWarehouse>[];
}

interface InventoryRecord {
  readonly sku: string;
  readonly name: string;
  readonly available: number;
  readonly warehouses: readonly Readonly<InventoryWarehouse>[];
}

export const lookupInventoryToolDefinition = createToolDefinition({
  name: "lookup_inventory",
  description:
    "Look up a product in a deterministic in-memory example inventory.",
  inputSchema: {
    type: "object",
    properties: {
      sku: { type: "string", minLength: 1, maxLength: 32 },
      includeWarehouses: { type: "boolean" },
    },
    required: ["sku"],
    additionalProperties: false,
  },
});

const inventory: readonly Readonly<InventoryRecord>[] = Object.freeze([
  inventoryRecord("AF-KEYBOARD-01", "AgentForge Mechanical Keyboard", 12, [
    warehouse("WAW", 7),
    warehouse("BER", 5),
  ]),
  inventoryRecord("AF-MOUSE-01", "AgentForge Wireless Mouse", 0, [
    warehouse("WAW", 0),
    warehouse("BER", 0),
  ]),
  inventoryRecord("AF-DOCK-01", "AgentForge USB-C Dock", 4, [
    warehouse("WAW", 1),
    warehouse("BER", 3),
  ]),
]);

export function lookupInventoryToolHandler(
  argumentsValue: Readonly<LookupInventoryArguments>,
  context: Readonly<ToolExecutionContext>,
): Promise<LookupInventoryOutput>;
export function lookupInventoryToolHandler(
  argumentsValue: ToolArguments,
  context: Readonly<ToolExecutionContext>,
): Promise<JsonValue>;
export async function lookupInventoryToolHandler(
  argumentsValue: ToolArguments,
  _context: Readonly<ToolExecutionContext>,
): Promise<LookupInventoryOutput> {
  const sku = readSku(argumentsValue.sku);
  const includeWarehouses = readOptionalBoolean(
    argumentsValue.includeWarehouses,
  );
  const item = inventory.find((candidate) => candidate.sku === sku);
  if (item === undefined) {
    throw new Error(`Inventory item "${sku}" was not found.`);
  }
  const base = {
    sku: item.sku,
    name: item.name,
    available: item.available,
    inStock: item.available > 0,
  };
  if (includeWarehouses !== true) return Object.freeze(base);
  return Object.freeze({
    ...base,
    warehouses: Object.freeze(
      item.warehouses.map(({ code, available }) =>
        Object.freeze({ code, available }),
      ),
    ),
  });
}

function warehouse(code: string, available: number): InventoryWarehouse {
  return Object.freeze({ code, available });
}

function inventoryRecord(
  sku: string,
  name: string,
  available: number,
  warehouses: readonly Readonly<InventoryWarehouse>[],
): Readonly<InventoryRecord> {
  return Object.freeze({
    sku,
    name,
    available,
    warehouses: Object.freeze([...warehouses]),
  });
}

function readSku(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  throw new Error("Inventory SKU must be a string.");
}

function readOptionalBoolean(
  value: JsonValue | undefined,
): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  throw new Error("includeWarehouses must be a boolean.");
}
