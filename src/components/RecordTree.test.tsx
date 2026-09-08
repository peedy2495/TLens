import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RecordTree } from "./RecordTree";

it("renders nested objects and arrays as expandable hierarchy with all scalar values", () => {
  const html = renderToStaticMarkup(
    <RecordTree
      value={{
        EventID: "EV-1",
        Equipment: [{ Name: "Piano", Teile: { Pedal: true, Anzahl: 2 } }],
        Notiz: null,
      }}
    />,
  );
  expect(html).toContain('<details open="">');
  for (const text of [
    "EV-1",
    "Equipment",
    "Piano",
    "Teile",
    "Pedal",
    "true",
    "Anzahl",
    "2",
    "null",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("[object Object]");
});
