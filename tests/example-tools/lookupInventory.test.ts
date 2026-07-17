import {
  lookupInventoryToolDefinition,
  lookupInventoryToolHandler,
} from "@agentforge/example-tools";
import { createToolExecutionContext } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const context = createToolExecutionContext();

describe("lookup_inventory example tool", () => {
  it("exports an immutable lookup schema", () => {
    expect(lookupInventoryToolDefinition).toMatchObject({
      name: "lookup_inventory",
      inputSchema: {
        type: "object",
        required: ["sku"],
        additionalProperties: false,
      },
    });
    expect(Object.isFrozen(lookupInventoryToolDefinition.inputSchema)).toBe(
      true,
    );
  });

  it("returns an in-stock product without warehouses by default", async () => {
    const output = await lookupInventoryToolHandler(
      { sku: "AF-KEYBOARD-01" },
      context,
    );
    expect(output).toEqual({
      sku: "AF-KEYBOARD-01",
      name: "AgentForge Mechanical Keyboard",
      available: 12,
      inStock: true,
    });
    expect(output).not.toHaveProperty("warehouses");
  });

  it("returns an out-of-stock product", async () => {
    await expect(
      lookupInventoryToolHandler({ sku: "AF-MOUSE-01" }, context),
    ).resolves.toMatchObject({ available: 0, inStock: false });
  });

  it("returns fresh deeply frozen warehouse output", async () => {
    const first = await lookupInventoryToolHandler(
      { sku: "AF-DOCK-01", includeWarehouses: true },
      context,
    );
    const second = await lookupInventoryToolHandler(
      { sku: "AF-DOCK-01", includeWarehouses: true },
      context,
    );
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.warehouses).not.toBe(second.warehouses);
    expect(first.warehouses).toEqual([
      { code: "WAW", available: 1 },
      { code: "BER", available: 3 },
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.warehouses)).toBe(true);
    expect(Object.isFrozen(first.warehouses?.[0])).toBe(true);
  });

  it.each(["af-keyboard-01", " AF-KEYBOARD-01 ", "UNKNOWN"])(
    "uses exact SKU matching for %s",
    async (sku) => {
      await expect(
        lookupInventoryToolHandler({ sku }, context),
      ).rejects.toThrow(`Inventory item "${sku}" was not found.`);
    },
  );
});
