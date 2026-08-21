import assert from "node:assert/strict";
import test from "node:test";

import {updateBonusImage} from "../scripts/services/bonus-image.mjs";

test("updateBonusImage persists a trimmed path through the bonus owner", async () => {
  const updates = [];
  const bonus = {
    img: "old.webp",
    async update(change) {
      updates.push(change);
      this.img = change.img;
    }
  };

  assert.equal(await updateBonusImage(bonus, "  new.webp  "), bonus);
  assert.deepEqual(updates, [{img: "new.webp"}]);
});

test("updateBonusImage ignores empty and unchanged paths", async () => {
  let calls = 0;
  const bonus = {img: "same.webp", async update() { calls++; }};

  await updateBonusImage(bonus, "same.webp");
  await updateBonusImage(bonus, "   ");

  assert.equal(calls, 0);
});
