import assert from "node:assert/strict";
import test from "node:test";

import {updateBonusImage} from "../scripts/services/bonus-image.mjs";

test("updateBonusImage persists a selected image through the bonus owner", async () => {
  const updates = [];
  const bonus = {
    img: "old.webp",
    async update(change) {
      updates.push(change);
      this.img = change.img;
    }
  };

  const result = await updateBonusImage(bonus, "  new/image.webp  ");

  assert.equal(result, bonus);
  assert.deepEqual(updates, [{img: "new/image.webp"}]);
  assert.equal(bonus.img, "new/image.webp");
});

test("updateBonusImage ignores empty and unchanged selections", async () => {
  let updates = 0;
  const bonus = {
    img: "same.webp",
    async update() {
      updates++;
    }
  };

  await updateBonusImage(bonus, "");
  await updateBonusImage(bonus, " same.webp ");

  assert.equal(updates, 0);
});
