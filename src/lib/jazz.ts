import { co, z } from "jazz-tools";
export const Workspace = co.map({ data: z.string() });
export const TLensAccount = co
  .account({ profile: co.profile(), root: Workspace })
  .withMigration((account) => {
    if (!account.$jazz.has("root"))
      account.$jazz.set("root", Workspace.create({ data: "[]" }));
  });
