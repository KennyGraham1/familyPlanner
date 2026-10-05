import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guessAisle } from "../src/lib/shopping";

describe("guessing a shopping aisle", () => {
  it("knows common items, including plurals", () => {
    assert.equal(guessAisle("Milk"), "Dairy & eggs");
    assert.equal(guessAisle("tomatoes"), "Produce");
    assert.equal(guessAisle("Chicken thighs"), "Meat & fish");
    assert.equal(guessAisle("sourdough loaf"), "Bakery");
    assert.equal(guessAisle("Toilet paper"), "Household");
  });
  it("prefers the more specific phrase", () => {
    assert.equal(guessAisle("Peanut butter"), "Pantry");
    assert.equal(guessAisle("coconut milk"), "Pantry");
  });
  it("remembers where the family put an item before", () => {
    assert.equal(
      guessAisle("Oat milk", [
        {
          id: "1",
          name: "oat milk",
          quantity: "",
          category: "Pantry",
          done: true,
        },
      ]),
      "Pantry",
    );
  });
  it("stays out of the way when unsure", () => {
    assert.equal(guessAisle("zz"), null);
    assert.equal(guessAisle("Birthday card"), null);
  });
});
