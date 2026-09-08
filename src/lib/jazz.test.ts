import { expect, it } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { TLensAccount } from "./jazz";

it("creates a local workspace and stores a replacement dataset", async () => {
  const account = await createJazzTestAccount({ AccountSchema: TLensAccount });
  const loaded = await account.$jazz.ensureLoaded({ resolve: { root: true } });
  expect(JSON.parse(loaded.root.data)).toEqual([]);
  const replacement = [{ path: ["Root", "Crew"], rows: [{ Name: "Ada" }] }];
  loaded.root.$jazz.set("data", JSON.stringify(replacement));
  expect(JSON.parse(loaded.root.data)).toEqual(replacement);
});
