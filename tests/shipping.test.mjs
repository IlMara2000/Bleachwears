import assert from "node:assert/strict";
import test from "node:test";
import { FREE_SHIPPING_FROM, freeShippingGap, shippingCost } from "../lib/shop/catalog.ts";

test("measures the gap from the published threshold, never below zero", () => {
  assert.equal(freeShippingGap(0), FREE_SHIPPING_FROM);
  assert.equal(freeShippingGap(49), FREE_SHIPPING_FROM - 49);
  assert.equal(freeShippingGap(FREE_SHIPPING_FROM), 0);
  assert.equal(freeShippingGap(FREE_SHIPPING_FROM + 30), 0);
  assert.equal(freeShippingGap(-10), FREE_SHIPPING_FROM);
});

test("closing the gap actually makes the standard shipment free", () => {
  const subtotal = 49;
  assert.equal(shippingCost("standard", subtotal + freeShippingGap(subtotal)), 0);
});