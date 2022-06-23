import { toZone } from "../../src/helpers";
import { interactiveCut } from "../../src/helpers/ui/cut";
import { interactivePaste } from "../../src/helpers/ui/paste";
import { Model } from "../../src/model";
import { ClipboardPlugin } from "../../src/plugins/ui/clipboard";
import { CellValueType, CommandResult, Zone } from "../../src/types/index";
import {
  activateSheet,
  addCellToSelection,
  addColumns,
  addRows,
  copy,
  createSheet,
  createSheetWithName,
  cut,
  deleteColumns,
  deleteRows,
  paste,
  pasteFromOSClipboard,
  selectCell,
  setAnchorCorner,
  setCellContent,
  setCellFormat,
  undo,
} from "../test_helpers/commands_helpers";
import {
  getBorder,
  getCell,
  getCellContent,
  getCellError,
  getCellText,
} from "../test_helpers/getters_helpers";
import {
  createEqualCF,
  getGrid,
  getPlugin,
  makeInteractiveTestEnv,
  target,
  toCartesianArray,
  toRangesData,
} from "../test_helpers/helpers";

function getClipboardVisibleZones(model: Model): Zone[] {
  const clipboardPlugin = getPlugin(model, ClipboardPlugin);
  return clipboardPlugin["status"] === "visible" ? clipboardPlugin["state"]!.zones : [];
}

describe("clipboard", () => {
  test("can copy and paste a cell", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");

    expect(getCell(model, "B2")).toMatchObject({
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });

    copy(model, "B2");
    paste(model, "D2");
    expect(getCell(model, "B2")).toMatchObject({
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });
    expect(getCell(model, "D2")).toMatchObject({
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });
    expect(getClipboardVisibleZones(model).length).toBe(0);
  });

  test("can cut and paste a cell", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    expect(getCell(model, "B2")).toMatchObject({
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });

    cut(model, "B2");
    expect(getCell(model, "B2")).toMatchObject({
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });
    paste(model, "D2");

    expect(getCell(model, "B2")).toBeUndefined();
    expect(getCell(model, "D2")).toMatchObject({
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });

    expect(getClipboardVisibleZones(model).length).toBe(0);

    // select D3 and paste. it should do nothing
    paste(model, "D3");

    expect(getCell(model, "D3")).toBeUndefined();
  });

  test("paste without copied value", () => {
    const model = new Model();
    const result = paste(model, "D2");
    expect(result).toBeCancelledBecause(CommandResult.EmptyClipboard);
  });

  test("paste without copied value interactively", () => {
    const model = new Model();
    const env = makeInteractiveTestEnv(model);
    interactivePaste(env, target("D2"));
    expect(getCellContent(model, "D2")).toBe("");
  });

  test("paste zones without copied value", () => {
    const model = new Model();
    const zones = [toZone("A1"), toZone("B2")];
    const clipboardPlugin = getPlugin(model, ClipboardPlugin);
    const pasteZone = clipboardPlugin["getPasteZones"](zones, []);
    expect(pasteZone).toEqual(zones);
  });

  test("can cut and paste a cell in different sheets", () => {
    const model = new Model();
    setCellContent(model, "A1", "a1");
    cut(model, "A1");
    const to = model.getters.getActiveSheetId();
    createSheet(model, { sheetId: "42", activate: true });
    setCellContent(model, "A1", "a1Sheet2");
    paste(model, "B2");
    expect(getCell(model, "A1")).toMatchObject({
      content: "a1Sheet2",
      evaluated: {
        type: CellValueType.text,
        value: "a1Sheet2",
      },
    });
    expect(getCell(model, "B2")).toMatchObject({
      content: "a1",
      evaluated: {
        type: CellValueType.text,
        value: "a1",
      },
    });
    activateSheet(model, to);
    expect(model.getters.getCells(to)).toEqual({});

    expect(getClipboardVisibleZones(model).length).toBe(0);

    // select D3 and paste. it should do nothing
    paste(model, "D3");

    expect(getCell(model, "D3")).toBeUndefined();
  });

  test("can cut and paste a zone inside the cut zone", () => {
    const model = new Model();
    setCellContent(model, "A1", "a1");
    setCellContent(model, "A2", "a2");

    cut(model, "A1:A2");
    expect(getGrid(model)).toEqual({ A1: "a1", A2: "a2" });

    paste(model, "A2");
    expect(getGrid(model)).toEqual({ A2: "a1", A3: "a2" });
  });

  test("can copy a cell with style", () => {
    const model = new Model();
    const sheet1 = model.getters.getActiveSheetId();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: sheet1,
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    copy(model, "B2");
    paste(model, "C2");

    expect(getCell(model, "B2")!.style).toEqual({ bold: true });
    expect(getCell(model, "C2")!.style).toEqual({ bold: true });
  });

  test("can copy into a cell with style", () => {
    const model = new Model();
    // set value and style in B2
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    // set value in A1, select and copy it
    setCellContent(model, "A1", "a1");
    selectCell(model, "A1");
    copy(model, "A1");

    // select B2 again and paste
    paste(model, "B2");

    expect(getCell(model, "B2")!.evaluated.value).toBe("a1");
    expect(getCell(model, "B2")!.style).not.toBeDefined();
  });

  test("can copy from an empty cell into a cell with style", () => {
    const model = new Model();
    const sheet1 = model.getters.getActiveSheetId();
    // set value and style in B2
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: sheet1,
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    // set value in A1, select and copy it
    selectCell(model, "A1");
    copy(model, "A1");

    paste(model, "B2");

    expect(getCell(model, "B2")).toBeUndefined();
  });

  test("can copy a cell with borders", () => {
    const model = new Model();
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
      border: "bottom",
    });
    expect(getBorder(model, "B2")).toEqual({ bottom: ["thin", "#000"] });

    copy(model, "B2");
    paste(model, "C2");

    expect(getBorder(model, "B2")).toEqual({ bottom: ["thin", "#000"] });
    expect(getBorder(model, "C2")).toEqual({ bottom: ["thin", "#000"] });
  });

  test("paste cell does not overwrite existing borders", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("SET_FORMATTING", {
      sheetId,
      target: target("A1"),
      border: "all",
    });
    copy(model, "B2");
    paste(model, "A1");
    const border = ["thin", "#000"];
    expect(model.getters.getCellBorder(sheetId, 0, 0)).toEqual({
      top: border,
      bottom: border,
      left: border,
      right: border,
    });
  });

  test("can copy a cell with a format", () => {
    const model = new Model();
    setCellContent(model, "B2", "0.451");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
      format: "0.00%",
    });
    expect(getCellContent(model, "B2")).toBe("45.10%");

    copy(model, "B2");
    paste(model, "C2");

    expect(getCellContent(model, "C2")).toBe("45.10%");
  });

  test("can copy and paste merged content", () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          merges: ["B1:C2"],
        },
      ],
    });
    copy(model, "B1");
    paste(model, "B4");
    expect(
      model.getters.isInMerge(model.getters.getActiveSheetId(), ...toCartesianArray("B4"))
    ).toBe(true);
    expect(
      model.getters.isInMerge(model.getters.getActiveSheetId(), ...toCartesianArray("B5"))
    ).toBe(true);
    expect(
      model.getters.isInMerge(model.getters.getActiveSheetId(), ...toCartesianArray("C4"))
    ).toBe(true);
    expect(
      model.getters.isInMerge(model.getters.getActiveSheetId(), ...toCartesianArray("B5"))
    ).toBe(true);
  });

  test("can cut and paste merged content", () => {
    const model = new Model({
      sheets: [
        {
          id: "s2",
          colNumber: 5,
          rowNumber: 5,
          merges: ["B1:C2"],
        },
      ],
    });
    cut(model, "B1");
    paste(model, "B4");
    expect(model.getters.isInMerge("s2", ...toCartesianArray("B1"))).toBe(false);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("B2"))).toBe(false);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("C1"))).toBe(false);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("B2"))).toBe(false);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("B4"))).toBe(true);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("B5"))).toBe(true);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("C4"))).toBe(true);
    expect(model.getters.isInMerge("s2", ...toCartesianArray("B5"))).toBe(true);
  });

  test("paste merge on existing merge removes existing merge", () => {
    const model = new Model({
      sheets: [
        {
          id: "s3",
          colNumber: 5,
          rowNumber: 5,
          merges: ["B2:C4"],
        },
      ],
    });
    copy(model, "B2");
    paste(model, "A1");
    expect(model.getters.isInMerge("s3", ...toCartesianArray("B2"))).toBe(true);
    expect(model.getters.isInMerge("s3", ...toCartesianArray("B3"))).toBe(true);
    expect(model.getters.isInMerge("s3", ...toCartesianArray("B4"))).toBe(false);
    expect(model.getters.isInMerge("s3", ...toCartesianArray("C2"))).toBe(false);
    expect(model.getters.isInMerge("s3", ...toCartesianArray("C3"))).toBe(false);
    expect(model.getters.isInMerge("s3", ...toCartesianArray("C4"))).toBe(false);
  });

  test("Pasting content on merge will remove the merge", () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          cells: {
            A1: { content: "miam" },
          },
          merges: ["B1:C2"],
        },
      ],
    });
    copy(model, "A1");
    paste(model, "B1", true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B1"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B2"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C1"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C2"))).toBe(false);
  });

  test("Pasting merge on content will remove the content", () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          cells: {
            A1: { content: "merge" },
            C1: { content: "a" },
            D2: { content: "a" },
          },
          merges: ["A1:B2"],
        },
      ],
    });
    copy(model, "A1");
    paste(model, "C1");
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C1"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("D2"))).toBe(true);
    expect(getCellContent(model, "C1")).toBe("merge");
    expect(getCellContent(model, "D2")).toBe("");
  });

  test("copy/paste a merge from one page to another", () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          merges: ["B2:C3"],
        },
        {
          id: "s2",
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    const sheet2 = "s2";
    copy(model, "B2");
    activateSheet(model, sheet2);
    paste(model, "A1");
    expect(model.getters.isInMerge(sheet2, ...toCartesianArray("A1"))).toBe(true);
    expect(model.getters.isInMerge(sheet2, ...toCartesianArray("A2"))).toBe(true);
    expect(model.getters.isInMerge(sheet2, ...toCartesianArray("B1"))).toBe(true);
    expect(model.getters.isInMerge(sheet2, ...toCartesianArray("B2"))).toBe(true);
  });

  test("copy/paste a formula that has no sheet specific reference to another", () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          cells: { A1: { content: "=A2" } },
        },
        {
          id: "s2",
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });

    expect(getCellText(model, "A1", "s1")).toBe("=A2");

    copy(model, "A1");
    activateSheet(model, "s2");
    paste(model, "A1");

    expect(getCellText(model, "A1", "s1")).toBe("=A2");
    expect(getCellText(model, "A1", "s2")).toBe("=A2");
  });

  test("Pasting content that will destroy a merge will notify the user", async () => {
    const notifyUser = jest.fn();
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
          merges: ["B2:C3"],
        },
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });

    selectCell(model, "B2");
    const selection = model.getters.getSelection().zones;
    model.dispatch("COPY", { target: selection });

    selectCell(model, "A1");
    const env = makeInteractiveTestEnv(model, { notifyUser });
    interactivePaste(env, model.getters.getSelectedZones());
    expect(notifyUser).toHaveBeenCalled();
  });

  test("Dispatch a PASTE command with interactive=true correctly takes pasteOption into account", async () => {
    const model = new Model();
    const style = { fontSize: 36 };
    const sheetId = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "=42");
    model.dispatch("UPDATE_CELL", { sheetId, col: 0, row: 0, style });

    copy(model, "A1");
    const env = makeInteractiveTestEnv(model);
    interactivePaste(env, target("B1"), "onlyFormat");
    interactivePaste(env, target("B2"), "onlyValue");
    interactivePaste(env, target("B3"));

    expect(getCellText(model, "B1")).toBe("");
    expect(getCell(model, "B1")!.style).toEqual(style);

    expect(getCellText(model, "B2")).toBe("42");
    expect(getCell(model, "B2")!.style).toBeUndefined();

    expect(getCellText(model, "B3")).toBe("=42");
    expect(getCell(model, "B3")!.style).toEqual(style);
  });

  test("Pasting content that will destroy a merge will fail if not forced", async () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          merges: ["B2:C3"],
        },
        {
          id: "s2",
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });

    selectCell(model, "B2");
    const selection = model.getters.getSelection().zones;
    model.dispatch("COPY", { target: selection });
    const result = paste(model, "A1");
    expect(result).toBeCancelledBecause(CommandResult.WillRemoveExistingMerge);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("A1"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("A2"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B1"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B2"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B3"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C2"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C3"))).toBe(true);
  });

  test("Pasting content that will destroy a merge will be applied if forced", async () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
          merges: ["B2:C3"],
        },
      ],
    });
    selectCell(model, "B2");
    const selection = model.getters.getSelection().zones;
    model.dispatch("COPY", { target: selection });
    paste(model, "A1", true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("A1"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("A2"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B1"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B2"))).toBe(true);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("B3"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C2"))).toBe(false);
    expect(model.getters.isInMerge("s1", ...toCartesianArray("C3"))).toBe(false);
  });

  test("cutting a cell with style remove the cell", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });

    cut(model, "B2");
    paste(model, "C2");

    expect(getCell(model, "C2")).toMatchObject({
      style: { bold: true },
      content: "b2",
      evaluated: {
        type: CellValueType.text,
        value: "b2",
      },
    });
    expect(getCell(model, "B2")).toBeUndefined();
  });

  test("getClipboardContent export formatted string", () => {
    const model = new Model();
    setCellContent(model, "B2", "abc");
    selectCell(model, "B2");
    copy(model, "B2");
    expect(model.getters.getClipboardContent()).toBe("abc");

    setCellContent(model, "B2", "= 1 + 2");
    selectCell(model, "B2");
    copy(model, "B2");
    expect(model.getters.getClipboardContent()).toBe("3");
  });

  test("can copy a rectangular selection", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    setCellContent(model, "B3", "b3");
    setCellContent(model, "C2", "c2");
    setCellContent(model, "C3", "c3");

    copy(model, "B2:C3");

    expect(getCell(model, "D1")).toBeUndefined();
    expect(getCell(model, "D2")).toBeUndefined();
    expect(getCell(model, "E1")).toBeUndefined();
    expect(getCell(model, "E2")).toBeUndefined();

    paste(model, "D1");

    expect(getCellContent(model, "D1")).toBe("b2");
    expect(getCellContent(model, "D2")).toBe("b3");
    expect(getCellContent(model, "E1")).toBe("c2");
    expect(getCellContent(model, "E2")).toBe("c3");
  });

  test("empty clipboard: getClipboardContent returns a tab", () => {
    const model = new Model();
    expect(model.getters.getClipboardContent()).toBe("\t");
  });

  test("getClipboardContent exports multiple cells", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    setCellContent(model, "B3", "b3");
    setCellContent(model, "C2", "c2");
    setCellContent(model, "C3", "c3");
    copy(model, "B2:C3");
    expect(model.getters.getClipboardContent()).toBe("b2\tc2\nb3\tc3");
  });

  test("can paste multiple cells from os clipboard", () => {
    const model = new Model();
    pasteFromOSClipboard(model, "C1", "a\t1\nb\t2");

    expect(getCellContent(model, "C1")).toBe("a");
    expect(getCellContent(model, "C2")).toBe("b");
    expect(getCellContent(model, "D1")).toBe("1");
    expect(getCellContent(model, "D2")).toBe("2");
  });

  test("pasting numbers from windows clipboard => interpreted as number", () => {
    const model = new Model();
    pasteFromOSClipboard(model, "C1", "1\r\n2\r\n3");

    expect(getCellContent(model, "C1")).toBe("1");
    expect(getCell(model, "C1")?.evaluated.value).toBe(1);
    expect(getCellContent(model, "C2")).toBe("2");
    expect(getCell(model, "C2")?.evaluated.value).toBe(2);
    expect(getCellContent(model, "C3")).toBe("3");
    expect(getCell(model, "C3")?.evaluated.value).toBe(3);
  });

  test("incompatible multiple selections: only last one is actually copied", () => {
    const model = new Model();
    setCellContent(model, "A1", "a1");
    setCellContent(model, "A2", "a2");
    setCellContent(model, "C1", "c1");
    copy(model, "A1:A2, C1");

    expect(getClipboardVisibleZones(model).length).toBe(1);

    selectCell(model, "E1");
    paste(model, "E1");
    expect(getCellContent(model, "E1")).toBe("c1");
    expect(getCell(model, "E2")).toBeUndefined();
  });

  test("compatible multiple selections: each column is copied", () => {
    const model = new Model();
    setCellContent(model, "A1", "a1");
    setCellContent(model, "A2", "a2");
    setCellContent(model, "C1", "c1");
    setCellContent(model, "C2", "c2");
    copy(model, "A1:A2, C1:C2");

    expect(getClipboardVisibleZones(model).length).toBe(2);

    paste(model, "E1");
    expect(getCellContent(model, "E1")).toBe("a1");
    expect(getCellContent(model, "E2")).toBe("a2");
    expect(getCellContent(model, "F1")).toBe("c1");
    expect(getCellContent(model, "F2")).toBe("c2");
  });

  describe("copy/paste a zone in a larger selection will duplicate the zone on the selection as long as it does not exceed it", () => {
    test("paste a value (zone with hight=1 and width=1)", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      copy(model, "A1");
      paste(model, "C2:D3");
      expect(getCellContent(model, "C2")).toBe("1");
      expect(getCellContent(model, "C3")).toBe("1");
      expect(getCellContent(model, "D2")).toBe("1");
      expect(getCellContent(model, "D3")).toBe("1");
    });

    test("paste a zone with hight zone > 1", () => {
      const model = new Model();
      setCellContent(model, "A1", "a1");
      setCellContent(model, "A2", "a2");
      copy(model, "A1:A2");
      paste(model, "A3:A7");
      expect(getCellContent(model, "A3")).toBe("a1");
      expect(getCellContent(model, "A4")).toBe("a2");
      expect(getCellContent(model, "A5")).toBe("a1");
      expect(getCellContent(model, "A6")).toBe("a2");
      expect(getCellContent(model, "A7")).toBe("");
    });

    test("paste a zone with width zone > 1", () => {
      const model = new Model();
      setCellContent(model, "A1", "a1");
      setCellContent(model, "B1", "b1");
      copy(model, "A1:B1");
      paste(model, "C1:G1");
      expect(getCellContent(model, "C1")).toBe("a1");
      expect(getCellContent(model, "D1")).toBe("b1");
      expect(getCellContent(model, "E1")).toBe("a1");
      expect(getCellContent(model, "F1")).toBe("b1");
      expect(getCellContent(model, "G1")).toBe("");
    });

    test("selection is updated to contain exactly the new pasted zone", () => {
      const model = new Model();
      copy(model, "A1:B2");

      // select C3:G7
      selectCell(model, "C3");
      setAnchorCorner(model, "G7");
      expect(model.getters.getSelectedZones()[0]).toEqual({ top: 2, left: 2, bottom: 6, right: 6 });

      paste(model, "C3:G7");
      expect(model.getters.getSelectedZones()[0]).toEqual({ top: 2, left: 2, bottom: 5, right: 5 });
    });
  });

  describe("cut/paste a zone in a larger selection will paste the zone only once", () => {
    test("paste a value (zone with hight=1 and width=1)", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      cut(model, "A1");
      paste(model, "C2:D3");
      expect(getCellContent(model, "C2")).toBe("1");
      expect(getCellContent(model, "C3")).toBe("");
      expect(getCellContent(model, "D2")).toBe("");
      expect(getCellContent(model, "D3")).toBe("");
    });

    test("with hight zone > 1", () => {
      const model = new Model();
      setCellContent(model, "A1", "a1");
      setCellContent(model, "A2", "a2");
      cut(model, "A1:A2");
      paste(model, "A3:A7");
      expect(getCellContent(model, "A3")).toBe("a1");
      expect(getCellContent(model, "A4")).toBe("a2");
      expect(getCellContent(model, "A5")).toBe("");
      expect(getCellContent(model, "A6")).toBe("");
      expect(getCellContent(model, "A7")).toBe("");
    });

    test("with width zone > 1", () => {
      const model = new Model();
      setCellContent(model, "A1", "a1");
      setCellContent(model, "B1", "b1");
      cut(model, "A1:B1");
      paste(model, "C1:G1");
      expect(getCellContent(model, "C1")).toBe("a1");
      expect(getCellContent(model, "D1")).toBe("b1");
      expect(getCellContent(model, "E1")).toBe("");
      expect(getCellContent(model, "F1")).toBe("");
      expect(getCellContent(model, "G1")).toBe("");
    });

    test("selection is updated to contain exactly the cut and pasted zone", () => {
      const model = new Model();
      cut(model, "A1:B2");

      // select C3:G7
      selectCell(model, "C3");
      setAnchorCorner(model, "G7");

      expect(model.getters.getSelectedZones()[0]).toEqual({ top: 2, left: 2, bottom: 6, right: 6 });

      paste(model, "C3:G7");
      expect(model.getters.getSelectedZones()[0]).toEqual({ top: 2, left: 2, bottom: 3, right: 3 });
    });
  });

  describe("copy/paste a zone in several selection will duplicate the zone on each selection", () => {
    test("paste a value (zone with hight=1 and width=1)", () => {
      const model = new Model();
      setCellContent(model, "A1", "33");
      copy(model, "A1");
      paste(model, "C1, E1");
      expect(getCellContent(model, "C1")).toBe("33");
      expect(getCellContent(model, "E1")).toBe("33");
    });

    test("selection is updated to contain exactly the new pasted zones", () => {
      const model = new Model();
      copy(model, "A1");

      // select C1 and E1
      selectCell(model, "C1");
      addCellToSelection(model, "E1");

      paste(model, "C1, E1");
      expect(model.getters.getSelectedZones()[0]).toEqual({ top: 0, left: 2, bottom: 0, right: 2 });
      expect(model.getters.getSelectedZones()[1]).toEqual({ top: 0, left: 4, bottom: 0, right: 4 });
    });

    test("paste a zone with more than one value is not allowed", () => {
      const model = new Model();
      copy(model, "A1:B2");
      const result = paste(model, "C1, E1");
      expect(result).toBeCancelledBecause(CommandResult.WrongPasteSelection);
    });

    test("paste a zone with more than one value will warn user", async () => {
      const notifyUser = jest.fn();
      const model = new Model();
      copy(model, "A1:A2");

      // select C4 and F6
      selectCell(model, "C4");
      addCellToSelection(model, "F6");

      const env = makeInteractiveTestEnv(model, { notifyUser });
      interactivePaste(env, model.getters.getSelectedZones());
      expect(notifyUser).toHaveBeenCalled();
    });
  });

  describe("cut/paste a zone in several selection will paste the zone only once", () => {
    test("paste a value (zone with hight=1 and width=1)", () => {
      const model = new Model();
      setCellContent(model, "A1", "33");
      cut(model, "A1");
      paste(model, "E1, C1");
      expect(getCellContent(model, "E1")).toBe("33");
      expect(getCellContent(model, "C1")).toBe("");
    });

    test("selection is updated to contain exactly the new pasted zones", () => {
      const model = new Model();
      cut(model, "A1");

      // select C1 and E1
      selectCell(model, "C1");
      addCellToSelection(model, "E1");

      paste(model, "C1, E1");
      expect(model.getters.getSelectedZones()[0]).toEqual({ top: 0, left: 2, bottom: 0, right: 2 });
      expect(model.getters.getSelectedZones().length).toBe(1);
    });

    test("paste a zone with more than one value is not allowed", () => {
      const model = new Model();
      cut(model, "A1:B2");
      const result = paste(model, "C1, E1");
      expect(result).toBeCancelledBecause(CommandResult.WrongPasteSelection);
    });

    test("paste a zone with more than one value will warn user", async () => {
      const notifyUser = jest.fn();
      const model = new Model();
      cut(model, "A1:A2");

      selectCell(model, "C4");
      addCellToSelection(model, "F6");
      const env = makeInteractiveTestEnv(model, { notifyUser });
      interactivePaste(env, model.getters.getSelectedZones());
      expect(notifyUser).toHaveBeenCalled();
    });
  });

  describe("cut/paste several zones", () => {
    test("cutting is not allowed if multiple selection", () => {
      const model = new Model();
      const result = cut(model, "A1, A2");
      expect(result).toBeCancelledBecause(CommandResult.WrongCutSelection);
    });

    test("cutting with multiple selection will warn user", async () => {
      const notifyUser = jest.fn();
      const model = new Model();
      const env = makeInteractiveTestEnv(model, { notifyUser });
      interactiveCut(env, [toZone("A1"), toZone("A2")]);
      expect(notifyUser).toHaveBeenCalled();
    });
  });

  describe("copy/paste several zones", () => {
    const model = new Model();

    beforeEach(() => {
      setCellContent(model, "A1", "a1");
      setCellContent(model, "A2", "a2");
      setCellContent(model, "A3", "a3");
      setCellContent(model, "B1", "b1");
      setCellContent(model, "B2", "b2");
      setCellContent(model, "B3", "b3");
      setCellContent(model, "C1", "c1");
      setCellContent(model, "C2", "c2");
      setCellContent(model, "C3", "c3");
    });

    describe("if they have same left and same right", () => {
      test("copy all zones", () => {
        copy(model, "A1:B1, A2:B2");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("A1:B1"));
        expect(getClipboardVisibleZones(model)[1]).toEqual(toZone("A2:B2"));
        expect(getClipboardVisibleZones(model).length).toBe(2);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a2");
        expect(getCellContent(model, "G6")).toBe("b1");
        expect(getCellContent(model, "G7")).toBe("b2");
      });

      test("Copy cells only once", () => {
        copy(model, "A1:A3, A1:A2, A2:A3, A1, A2, A3");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("A1:A3"));
        expect(getClipboardVisibleZones(model).length).toBe(1);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a2");
        expect(getCellContent(model, "F8")).toBe("a3");
        expect(getCellContent(model, "F9")).toBe("");
      });

      test("paste zones without gap", () => {
        // gap between 1st selection and 2nd selection is one row
        copy(model, "A1:B1, A3:B3");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("A1:B1"));
        expect(getClipboardVisibleZones(model)[1]).toEqual(toZone("A3:B3"));
        expect(getClipboardVisibleZones(model).length).toBe(2);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a3");
        expect(getCellContent(model, "G6")).toBe("b1");
        expect(getCellContent(model, "G7")).toBe("b3");
      });

      test("paste zones selected from different orders does not influence the final result", () => {
        copy(model, "A1, A2");
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a2");

        copy(model, "A2, A1");
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a2");
      });
    });

    describe("if zones have same top and same bottom", () => {
      test("copy all zones", () => {
        copy(model, "A1:A2, B1:B2");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("A1:A2"));
        expect(getClipboardVisibleZones(model)[1]).toEqual(toZone("B1:B2"));
        expect(getClipboardVisibleZones(model).length).toBe(2);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a2");
        expect(getCellContent(model, "G6")).toBe("b1");
        expect(getCellContent(model, "G7")).toBe("b2");
      });

      test("Copy cells only once", () => {
        copy(model, "A1:C1, A1:B1, B1:C1, A1, B1, C1");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("A1:C1"));
        expect(getClipboardVisibleZones(model).length).toBe(1);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "G6")).toBe("b1");
        expect(getCellContent(model, "H6")).toBe("c1");
        expect(getCellContent(model, "I6")).toBe("");
      });

      test("paste zones without gap", () => {
        // gap between 1st selection and 2nd selection is one column
        copy(model, "A1:A2, C1:C2");
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "F7")).toBe("a2");
        expect(getCellContent(model, "G6")).toBe("c1");
        expect(getCellContent(model, "G7")).toBe("c2");
      });

      test("paste zones selected from different orders does not influence the final result", () => {
        copy(model, "A1, B1");
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "G6")).toBe("b1");

        copy(model, "A1, B1");
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("a1");
        expect(getCellContent(model, "G6")).toBe("b1");
      });
    });

    describe("copy/paste the last zone if zones don't have [same top and same bottom] or [same left and same right]", () => {
      test("test with dissociated zones", () => {
        copy(model, "A1:A2, B2:B3");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("B2:B3"));
        expect(getClipboardVisibleZones(model).length).toBe(1);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("b2");
        expect(getCellContent(model, "F7")).toBe("b3");
      });

      test("test with overlapped zones", () => {
        copy(model, "A1:B2, B2:B3");
        expect(getClipboardVisibleZones(model)[0]).toEqual(toZone("B2:B3"));
        expect(getClipboardVisibleZones(model).length).toBe(1);
        paste(model, "F6");
        expect(getCellContent(model, "F6")).toBe("b2");
        expect(getCellContent(model, "F7")).toBe("b3");
      });
    });

    test("can paste zones in a larger selection", () => {
      copy(model, "A1, C1");
      paste(model, "E1:I1");
      expect(getCellContent(model, "E1")).toBe("a1");
      expect(getCellContent(model, "F1")).toBe("c1");
      expect(getCellContent(model, "G1")).toBe("a1");
      expect(getCellContent(model, "H1")).toBe("c1");
      expect(getCellContent(model, "I1")).toBe("");
    });

    test("is not allowed if paste in several selection", () => {
      copy(model, "A1, C1");
      const result = paste(model, "A2, B2");
      expect(result).toBeCancelledBecause(CommandResult.WrongPasteSelection);
    });

    test("will warn user if paste in several selection", () => {
      const notifyUser = jest.fn();
      const model = new Model();
      copy(model, "A1, C1");
      const env = makeInteractiveTestEnv(model, { notifyUser });
      interactivePaste(env, target("A2, B2"));
      expect(notifyUser).toHaveBeenCalled();
    });
  });
  test("can copy and paste a cell with STRING content", () => {
    const model = new Model();
    setCellContent(model, "B2", '="test"');

    expect(getCellText(model, "B2")).toEqual('="test"');
    expect(getCell(model, "B2")!.evaluated.value).toEqual("test");

    copy(model, "B2");
    paste(model, "D2");
    expect(getCellText(model, "B2")).toEqual('="test"');
    expect(getCell(model, "B2")!.evaluated.value).toEqual("test");
    expect(getCellText(model, "D2")).toEqual('="test"');
    expect(getCell(model, "D2")!.evaluated.value).toEqual("test");
    expect(getClipboardVisibleZones(model).length).toBe(0);
  });

  test("can undo a paste operation", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");

    copy(model, "B2");
    paste(model, "D2");
    expect(getCell(model, "D2")).toBeDefined();
    undo(model);
    expect(getCell(model, "D2")).toBeUndefined();
  });

  test("can paste-format a cell with style", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    copy(model, "B2");
    paste(model, "C2", false, "onlyFormat");
    expect(getCellContent(model, "C2")).toBe("");
    expect(getCell(model, "C2")!.style).toEqual({ bold: true });
  });

  test("can copy and paste format", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    copy(model, "B2");
    paste(model, "C2", false, "onlyFormat");
    expect(getCellContent(model, "C2")).toBe("");
    expect(getCell(model, "C2")!.style).toEqual({ bold: true });
  });

  test("paste format does not remove content", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    setCellContent(model, "C2", "c2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    copy(model, "B2");
    paste(model, "C2", false, "onlyFormat");

    expect(getCellContent(model, "C2")).toBe("c2");
    expect(getCell(model, "C2")!.style).toEqual({ bold: true });
  });

  test("can undo a paste format", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    copy(model, "B2");
    paste(model, "C2", false, "onlyFormat");

    expect(getCellContent(model, "C2")).toBe("");
    expect(getCell(model, "C2")!.style).toEqual({ bold: true });

    undo(model);
    expect(getCell(model, "C2")).toBeUndefined();
  });

  test("can copy and paste value only", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    copy(model, "B2");
    paste(model, "C2", false, "onlyValue");
    expect(getCellContent(model, "C2")).toBe("b2");
  });

  test("can copy a cell with a style and paste value only", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    copy(model, "B2");
    paste(model, "C2", false, "onlyValue");

    expect(getCell(model, "C2")!.evaluated.value).toBe("b2");
    expect(getCell(model, "C2")!.style).not.toBeDefined();
  });

  test("can copy a cell with a border and paste value only", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
      border: "bottom",
    });
    expect(getBorder(model, "B2")).toEqual({ bottom: ["thin", "#000"] });

    copy(model, "B2");
    paste(model, "C2", false, "onlyValue");

    expect(getCell(model, "C2")!.evaluated.value).toBe("b2");
    expect(getBorder(model, "C2")).toBeNull();
  });

  test("can copy a cell with a format and paste value only", () => {
    const model = new Model();
    setCellContent(model, "B2", "0.451");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
      format: "0.00%",
    });
    expect(getCellContent(model, "B2")).toBe("45.10%");

    copy(model, "B2");
    paste(model, "C2", false, "onlyValue");

    expect(getCellContent(model, "C2")).toBe("0.451");
  });

  test("can copy a cell with a conditional format and paste value only", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    setCellContent(model, "C1", "1");
    setCellContent(model, "C2", "2");
    const sheetId = model.getters.getActiveSheetId();
    let result = model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      ranges: toRangesData(sheetId, "A1,A2"),
      sheetId,
    });

    expect(result).toBeSuccessfullyDispatched();
    copy(model, "A1");
    paste(model, "C1", false, "onlyValue");
    copy(model, "A2");
    paste(model, "C2", false, "onlyValue");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("C1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("C2"))).toBeUndefined();
  });

  test("paste value only does not remove style", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    setCellContent(model, "C3", "c3");
    selectCell(model, "C3");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 2, right: 2, top: 2, bottom: 2 }],
      style: { bold: true },
    });
    expect(getCell(model, "C3")!.style).toEqual({ bold: true });

    copy(model, "B2");
    paste(model, "C3", false, "onlyValue");

    expect(getCellContent(model, "C3")).toBe("b2");
    expect(getCell(model, "C3")!.style).toEqual({ bold: true });
  });

  test("paste value only does not remove border", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    setCellContent(model, "C3", "c3");
    selectCell(model, "C3");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
      border: "bottom",
    });
    expect(getBorder(model, "C3")).toEqual({ bottom: ["thin", "#000"] });
    expect(getBorder(model, "C4")).toEqual({ top: ["thin", "#000"] });

    copy(model, "B2");
    paste(model, "C3", false, "onlyValue");

    expect(getCellContent(model, "C3")).toBe("b2");
    expect(getBorder(model, "C3")).toEqual({ bottom: ["thin", "#000"] });
  });

  test("paste value only does not remove formating", () => {
    const model = new Model();
    setCellContent(model, "B2", "42");
    setCellContent(model, "C3", "0.451");
    selectCell(model, "C3");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
      format: "0.00%",
    });
    expect(getCellContent(model, "C3")).toBe("45.10%");

    copy(model, "B2");
    paste(model, "C3", false, "onlyValue");

    expect(getCellContent(model, "C3")).toBe("4200.00%");
  });

  test("can copy a formula and paste value only", () => {
    const model = new Model();
    setCellContent(model, "A1", "=SUM(1+2)");
    setCellContent(model, "A2", "=EQ(42,42)");
    setCellContent(model, "A3", '=CONCAT("Ki","kou")');
    copy(model, "A1:A3");
    paste(model, "B1", false, "onlyValue");
    expect(getCellContent(model, "B1")).toBe("3");
    expect(getCellContent(model, "B2")).toBe("TRUE");
    expect(getCellContent(model, "B3")).toBe("Kikou");
  });

  test("can copy a formula and paste -> apply the format defined by user, if not apply the automatic evaluated format ", () => {
    const model = new Model();

    // formula without format
    setCellContent(model, "A1", "=SUM(1+2)");

    // formula with format seted on it
    setCellContent(model, "A2", "=SUM(1+2)");
    setCellFormat(model, "A2", "0%");

    // formula that return value with format
    setCellContent(model, "A3", "=DATE(2042,1,1)");

    // formula that return value with format and other format seted on it
    setCellContent(model, "A4", "=DATE(2042,1,1)");
    setCellFormat(model, "A4", "0%");

    // formula that return value with format infered from reference
    setCellContent(model, "A5", "3");
    setCellFormat(model, "A5", "0%");
    setCellContent(model, "A6", "=SUM(1+A5)");

    // formula that return value with format infered from reference and other format seted on it
    setCellContent(model, "A7", "3");
    setCellFormat(model, "A7", "0%");
    setCellContent(model, "A8", "=SUM(1+A7)");
    setCellFormat(model, "A8", "#,##0[$$]");

    copy(model, "A1:A8");
    paste(model, "B1", false);

    setCellFormat(model, "B5", "#,##0[$$]");
    setCellFormat(model, "B7", "0%");

    expect(getCellContent(model, "B1")).toBe("3");
    expect(getCellContent(model, "B2")).toBe("300%");
    expect(getCellContent(model, "B3")).toBe("1/1/2042");
    expect(getCellContent(model, "B4")).toBe("5186700%");
    expect(getCellContent(model, "B6")).toBe("4$");
    expect(getCellContent(model, "B8")).toBe("4$");
  });

  test("can copy a formula and paste format only --> apply the automatic evaluated format", () => {
    const model = new Model();

    // formula without format
    setCellContent(model, "A1", "=SUM(1+2)");

    // formula with format seted on it
    setCellContent(model, "A2", "=SUM(1+2)");
    setCellFormat(model, "A2", "0%");

    // formula that return value with format
    setCellContent(model, "A3", "=DATE(2042,1,1)");

    // formula that return value with format and other format seted on it
    setCellContent(model, "A4", "=DATE(2042,1,1)");
    setCellFormat(model, "A4", "0%");

    // formula that return value with format infered from reference
    setCellContent(model, "A5", "3");
    setCellFormat(model, "A5", "0%");
    setCellContent(model, "A6", "=SUM(1+A5)");

    // formula that return value with format infered from reference and other format seted on it
    setCellContent(model, "A7", "3");
    setCellFormat(model, "A7", "0%");
    setCellContent(model, "A8", "=SUM(1+A7)");
    setCellFormat(model, "A8", "#,##0[$$]");

    setCellContent(model, "B1", "42");
    setCellContent(model, "B2", "42");
    setCellContent(model, "B3", "42");
    setCellContent(model, "B4", "42");
    setCellContent(model, "B6", "42");
    setCellContent(model, "B8", "42");

    copy(model, "A1:A8");
    paste(model, "B1", false, "onlyFormat");

    expect(getCellContent(model, "B1")).toBe("42");
    expect(getCellContent(model, "B2")).toBe("4200%");
    expect(getCellContent(model, "B3")).toBe("2/10/1900");
    expect(getCellContent(model, "B4")).toBe("4200%");
    expect(getCellContent(model, "B6")).toBe("4200%");
    expect(getCellContent(model, "B8")).toBe("42$");
  });

  test("can undo a paste value only", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    copy(model, "B2");
    paste(model, "C2", false, "onlyValue");

    expect(getCellContent(model, "C2")).toBe("b2");
    expect(getCell(model, "C2")!.style).not.toBeDefined();

    undo(model);
    expect(getCell(model, "C2")).toBeUndefined();
  });

  test("cut and paste value only is not allowed", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    cut(model, "B2");
    const result = paste(model, "C3", false, "onlyValue");
    expect(result).toBeCancelledBecause(CommandResult.WrongPasteOption);
  });

  test("cut and paste format only is not allowed", () => {
    const model = new Model();
    setCellContent(model, "B2", "b2");
    cut(model, "B2");
    const result = paste(model, "C3", false, "onlyFormat");
    expect(result).toBeCancelledBecause(CommandResult.WrongPasteOption);
  });

  describe("copy/paste a formula with references", () => {
    test("update the references", () => {
      const model = new Model();
      setCellContent(model, "A1", "=SUM(C1:C2)");
      copy(model, "A1");
      paste(model, "B2");
      expect(getCellText(model, "B2")).toBe("=SUM(D2:D3)");
    });

    /* $C2:E$1 <=> $C$1:E2
     *
     *    a    b           c         d         e
     * --------------------------------------------
     * 1      |         |          |         |   x
     *        |         |          |         |
     * ----------------------------|---------
     * 2      |         |     x    |         |
     *
     *
     * */

    test.each([
      ["=SUM(C1:C2)", "=SUM(D2:D3)"],
      ["=$C1", "=$C2"],
      ["=SUM($C1:D$1)", "=SUM($C$1:E2)"], //excel and g-sheet compatibility ($C2:E$1 <=> $C$1:E2)
    ])("does not update fixed references", (value, expected) => {
      const model = new Model();
      setCellContent(model, "A1", value);
      copy(model, "A1");
      paste(model, "B2");
      expect(getCellText(model, "B2")).toBe(expected);
    });

    test("update cross-sheet reference", () => {
      const model = new Model();
      createSheet(model, { sheetId: "42" });
      setCellContent(model, "B2", "=Sheet2!B2");
      copy(model, "B2");
      paste(model, "B3");
      expect(getCellText(model, "B3")).toBe("=Sheet2!B3");
    });

    test("update cross-sheet reference with a space in the name", () => {
      const model = new Model();
      createSheetWithName(model, { sheetId: "42" }, "Sheet 2");
      setCellContent(model, "B2", "='Sheet 2'!B2");
      copy(model, "B2");
      paste(model, "B3");
      expect(getCellText(model, "B3")).toBe("='Sheet 2'!B3");
    });

    test("update cross-sheet reference in a smaller sheet", () => {
      const model = new Model();
      createSheet(model, { sheetId: "42", rows: 2, cols: 2 });
      setCellContent(model, "A1", "=Sheet2!A1:A2");
      copy(model, "A1");
      paste(model, "A2");
      expect(getCellText(model, "A2")).toBe("=Sheet2!A2:A3");
    });

    test("update cross-sheet reference to a range", () => {
      const model = new Model();
      createSheet(model, { sheetId: "42" });
      setCellContent(model, "A1", "=SUM(Sheet2!A2:A5)");
      copy(model, "A1");
      paste(model, "B1");
      expect(getCellText(model, "B1")).toBe("=SUM(Sheet2!B2:B5)");
    });
  });

  test("cut/paste a formula with references does not update references in the formula", () => {
    const model = new Model();
    setCellContent(model, "A1", "=SUM(C1:C2)");
    cut(model, "A1");
    paste(model, "B2");
    expect(getCellText(model, "B2")).toBe("=SUM(C1:C2)");
  });

  test("copy/paste a zone present in formulas references does not update references", () => {
    const model = new Model();
    setCellContent(model, "A1", "=B2");
    copy(model, "B2");
    paste(model, "C3");
    expect(getCellText(model, "A1")).toBe("=B2");
  });

  describe("cut/paste a zone present in formulas references", () => {
    test("update references", () => {
      const model = new Model();
      setCellContent(model, "A1", "=B2");
      cut(model, "B2");
      paste(model, "C3");
      expect(getCellText(model, "A1")).toBe("=C3");
    });

    test("update references to a range", () => {
      const model = new Model();
      setCellContent(model, "A1", "=SUM(B2:C3)");
      cut(model, "B2:C3");
      paste(model, "D4");
      expect(getCellText(model, "A1")).toBe("=SUM(D4:E5)");
    });

    test("update fixed references", () => {
      const model = new Model();
      setCellContent(model, "A1", "=$B$2");
      cut(model, "B2");
      paste(model, "C3");
      expect(getCellText(model, "A1")).toBe("=$C$3");
    });

    test("update cross-sheet reference", () => {
      const model = new Model();
      createSheet(model, { sheetId: "Sheet2" });
      setCellContent(model, "A1", "=Sheet2!$B$2");

      activateSheet(model, "Sheet2");
      cut(model, "B2");

      createSheet(model, { activate: true, sheetId: "Sheet3" });
      paste(model, "C3");

      activateSheet(model, "Sheet1");
      expect(getCellText(model, "A1")).toBe("=Sheet3!$C$3");
    });

    test("update references even if the the formula is present in the cutting zone", () => {
      const model = new Model();
      setCellContent(model, "A1", "=B1");
      setCellContent(model, "B1", "b1");
      cut(model, "A1:B1");
      paste(model, "A2");

      expect(getCellText(model, "A1")).toBe("");
      expect(getCellText(model, "B1")).toBe("");
      expect(getCellText(model, "A2")).toBe("=B2");
      expect(getCellText(model, "B2")).toBe("b1");
    });

    test("does not update reference if it isn't fully included in the zone", () => {
      const model = new Model();
      setCellContent(model, "A1", "=SUM(B1:C1)+B1");
      cut(model, "B1");
      paste(model, "B2");
      expect(getCellText(model, "A1")).toBe("=SUM(B1:C1)+B2");
    });

    test("does not update reference if it isn't fully included in the zone even if the the formula is present in the cutting zone", () => {
      const model = new Model();
      setCellContent(model, "A1", "=SUM(B1:C1)+B1");
      setCellContent(model, "B1", "b1");
      cut(model, "A1:B1");
      paste(model, "A2");

      expect(getCellText(model, "A1")).toBe("");
      expect(getCellText(model, "B1")).toBe("");
      expect(getCellText(model, "A2")).toBe("=SUM(B1:C1)+B2");
      expect(getCellText(model, "B2")).toBe("b1");
    });
  });

  test.each([
    ["=SUM(1:2)", "=SUM(2:3)"],
    ["=$C1:1", "=$C2:2"],
    ["=SUM($A:D$2)", "=SUM($A$2:E)"],
  ])("can copy and paste formula with full cols/rows", (value, expected) => {
    const model = new Model();
    setCellContent(model, "A1", value);
    model.dispatch("COPY", { target: target("A1") });
    model.dispatch("PASTE", { target: target("B2") });
    expect(getCellText(model, "B2")).toBe(expected);
  });

  test("can copy format from empty cell to another cell to clear format", () => {
    const model = new Model();

    // write something in B2 and set its format
    setCellContent(model, "B2", "b2");
    selectCell(model, "B2");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 1, right: 1, top: 1, bottom: 1 }],
      style: { bold: true },
    });
    expect(getCell(model, "B2")!.style).toEqual({ bold: true });

    // select A1 and copy format
    copy(model, "A1");

    // select B2 and paste format
    paste(model, "B2", false, "onlyFormat");

    expect(getCellContent(model, "B2")).toBe("b2");
    expect(getCell(model, "B2")!.style).not.toBeDefined();
  });

  test("can copy and paste a conditional formatted cell", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    setCellContent(model, "C1", "1");
    setCellContent(model, "C2", "2");
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      sheetId,
      ranges: toRangesData(sheetId, "A1,A2"),
    });
    copy(model, "A1");
    paste(model, "C1");
    copy(model, "A2");
    paste(model, "C2");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("C1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("C2"))).toBeUndefined();
  });
  test("can cut and paste a conditional formatted cell", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    setCellContent(model, "C1", "1");
    setCellContent(model, "C2", "2");
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      ranges: toRangesData(sheetId, "A1,A2"),
      sheetId,
    });
    cut(model, "A1");
    paste(model, "C1");
    cut(model, "A2");
    paste(model, "C2");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("C1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("C2"))).toBeUndefined();
  });

  test("can copy and paste a conditional formatted zone", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      ranges: toRangesData(sheetId, "A1,A2"),
      sheetId,
    });
    copy(model, "A1:A2");
    paste(model, "B1");
    paste(model, "C1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("B1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("B2"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("C1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("C2"))).toBeUndefined();
    setCellContent(model, "C1", "2");
    setCellContent(model, "C2", "1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("C1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("C2"))).toEqual({
      fillColor: "#FF0000",
    });
  });

  test("can cut and paste a conditional formatted zone", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      ranges: toRangesData(sheetId, "A1,A2"),
      sheetId,
    });
    cut(model, "A1:A2");
    paste(model, "B1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("B1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("B2"))).toBeUndefined();
    setCellContent(model, "B1", "2");
    setCellContent(model, "B2", "1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("B1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("B2"))).toEqual({
      fillColor: "#FF0000",
    });
  });

  test("can copy and paste a conditional formatted cell to another page", () => {
    const model = new Model({
      sheets: [
        {
          id: "s1",
          colNumber: 5,
          rowNumber: 5,
        },
        {
          id: "s2",
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      ranges: toRangesData(sheetId, "A1,A2"),
      sheetId,
    });
    copy(model, "A1:A2");
    activateSheet(model, "s2");
    paste(model, "A1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    setCellContent(model, "A1", "2");
    setCellContent(model, "A2", "1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toEqual({
      fillColor: "#FF0000",
    });
  });

  test("can cut and paste a conditional formatted cell to another page", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
        },
        {
          colNumber: 5,
          rowNumber: 5,
        },
      ],
    });
    const sheet1 = model.getters.getSheetIds()[0];
    const sheet2 = model.getters.getSheetIds()[1];
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "2");
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#FF0000" }, "1"),
      ranges: toRangesData(sheetId, "A1,A2"),
      sheetId,
    });
    cut(model, "A1:A2");
    activateSheet(model, sheet2);
    paste(model, "A1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toEqual({
      fillColor: "#FF0000",
    });
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
    setCellContent(model, "A1", "2");
    setCellContent(model, "A2", "1");
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toEqual({
      fillColor: "#FF0000",
    });
    activateSheet(model, sheet1);
    expect(model.getters.getConditionalStyle(...toCartesianArray("A1"))).toBeUndefined();
    expect(model.getters.getConditionalStyle(...toCartesianArray("A2"))).toBeUndefined();
  });

  test("can copy and paste a cell which contains a cross-sheet reference", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42" });
    setCellContent(model, "B2", "=Sheet2!B2");

    copy(model, "B2");
    paste(model, "B3");
    expect(getCellText(model, "B3")).toBe("=Sheet2!B3");
  });

  test("can copy and paste a cell which contains a cross-sheet reference with a space in the name", () => {
    const model = new Model();
    createSheetWithName(model, { sheetId: "42" }, "Sheet 2");
    setCellContent(model, "B2", "='Sheet 2'!B2");

    copy(model, "B2");
    paste(model, "B3");
    expect(getCellText(model, "B3")).toBe("='Sheet 2'!B3");
  });

  test("can copy and paste a cell which contains a cross-sheet reference in a smaller sheet", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42", rows: 2, cols: 2 });
    setCellContent(model, "A1", "=Sheet2!A1:A2");

    copy(model, "A1");
    paste(model, "A2");
    expect(getCellText(model, "A2")).toBe("=Sheet2!A2:A3");
  });

  test("can copy and paste a cell which contains a cross-sheet reference to a range", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42" });
    setCellContent(model, "A1", "=SUM(Sheet2!A2:A5)");

    copy(model, "A1");
    paste(model, "B1");
    expect(getCellText(model, "B1")).toBe("=SUM(Sheet2!B2:B5)");
  });

  test.each([
    ["=A1", "=#REF"],
    ["=SUM(A1:B1)", "=SUM(#REF)"],
  ])("Copy invalid ranges due to row deletion", (initialFormula, expectedInvalidFormula) => {
    const model = new Model();
    setCellContent(model, "A3", initialFormula);
    deleteRows(model, [0]);
    expect(getCell(model, "A2")!.content).toBe(expectedInvalidFormula);

    copy(model, "A2");
    paste(model, "C5");
    expect(getCell(model, "C5")!.content).toBe(expectedInvalidFormula);
  });

  test.each([
    ["=A1", "=#REF"],
    ["=SUM(A1:A2)", "=SUM(#REF)"],
  ])("Copy invalid ranges due to column deletion", (initialFormula, expectedInvalidFormula) => {
    const model = new Model();
    setCellContent(model, "C1", initialFormula);
    deleteColumns(model, ["A"]);
    expect(getCell(model, "B1")!.content).toBe(expectedInvalidFormula);

    copy(model, "B1");
    paste(model, "C3");
    expect(getCell(model, "C3")!.content).toBe(expectedInvalidFormula);
  });

  test.each([
    ["=A1", "=#REF"],
    ["=SUM(A1:B1)", "=SUM(#REF)"],
  ])("Cut invalid ranges due to row deletion", (initialFormula, expectedInvalidFormula) => {
    const model = new Model();
    setCellContent(model, "A3", initialFormula);
    deleteRows(model, [0]);
    expect(getCell(model, "A2")!.content).toBe(expectedInvalidFormula);

    cut(model, "A2");
    paste(model, "C5");
    expect(getCell(model, "C5")!.content).toBe(expectedInvalidFormula);
  });

  test.each([
    ["=A1", "=#REF"],
    ["=SUM(A1:A2)", "=SUM(#REF)"],
  ])("Cut invalid ranges due to column deletion", (initialFormula, expectedInvalidFormula) => {
    const model = new Model();
    setCellContent(model, "C1", initialFormula);
    deleteColumns(model, ["A"]);
    expect(getCell(model, "B1")!.content).toBe(expectedInvalidFormula);

    cut(model, "B1");
    paste(model, "C3");
    expect(getCell(model, "C3")!.content).toBe(expectedInvalidFormula);
  });
});

describe("clipboard: pasting outside of sheet", () => {
  test("can copy and paste a full column", () => {
    const model = new Model();
    setCellContent(model, "A1", "txt");
    const activeSheetId = model.getters.getActiveSheetId();
    const currentRowNumber = model.getters.getNumberRows(activeSheetId);

    model.dispatch("COPY", { target: [model.getters.getColsZone(activeSheetId, 0, 0)] });
    paste(model, "B2");
    expect(model.getters.getNumberRows(activeSheetId)).toBe(currentRowNumber + 1);
    expect(getCellContent(model, "B2")).toBe("txt");
    expect(model.getters.getSelectedZones()).toEqual([toZone("B2:B101")]);
  });

  test("can copy and paste a full row", () => {
    const model = new Model();
    setCellContent(model, "A1", "txt");

    const activeSheetId = model.getters.getActiveSheetId();
    const currentColNumber = model.getters.getNumberCols(activeSheetId);

    model.dispatch("COPY", { target: [model.getters.getRowsZone(activeSheetId, 0, 0)] });
    paste(model, "B2");
    expect(model.getters.getNumberCols(activeSheetId)).toBe(currentColNumber + 1);
    expect(getCellContent(model, "B2")).toBe("txt");
    expect(model.getters.getSelectedZones()).toEqual([toZone("B2:AA2")]);
  });

  test("Copy a formula which lead to #REF", () => {
    const model = new Model();
    setCellContent(model, "B3", "=A1");
    copy(model, "B3");
    paste(model, "B2");
    expect(getCellContent(model, "B2", "#BAD_EXPR"));
    expect(getCellError(model, "B2")).toEqual("Invalid reference");
  });

  test("Can cut & paste a formula", () => {
    const model = new Model();
    setCellContent(model, "A1", "=1");
    cut(model, "A1");
    paste(model, "B1");
    expect(getCellContent(model, "A1")).toBe("");
    expect(getCellText(model, "B1")).toBe("=1");
  });

  test("Cut & paste a formula update offsets only if the range is in the zone", () => {
    const model = new Model();
    setCellContent(model, "B1", "2");
    setCellContent(model, "B2", "=B1");
    setCellContent(model, "B3", "=B2");
    cut(model, "B2:B3");
    paste(model, "C2");
    expect(getCellText(model, "C2")).toBe("=B1");
    expect(getCellText(model, "C3")).toBe("=C2");
  });

  test("can paste multiple cells from os to outside of sheet", () => {
    const model = new Model();
    createSheet(model, { activate: true, sheetId: "2", rows: 2, cols: 2 });
    pasteFromOSClipboard(model, "B2", "A\nque\tcoucou\nBOB");
    expect(getCellContent(model, "B2")).toBe("A");
    expect(getCellContent(model, "B3")).toBe("que");
    expect(getCellContent(model, "C3")).toBe("coucou");
    expect(getCellContent(model, "B4")).toBe("BOB");

    createSheet(model, {
      activate: true,
      sheetId: "3",
      rows: 2,
      cols: 2,
    });
    pasteFromOSClipboard(model, "B2", "A\nque\tcoucou\tPatrick");
    expect(getCellContent(model, "B2")).toBe("A");
    expect(getCellContent(model, "B3")).toBe("que");
    expect(getCellContent(model, "C3")).toBe("coucou");
    expect(getCellContent(model, "D3")).toBe("Patrick");
  });

  describe("add col/row can invalidate the clipboard of cut", () => {
    test("adding a column before a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "B1", "2");

      model.dispatch("CUT", { target: target("A1:B1") });
      addColumns(model, "before", "A", 1);
      model.dispatch("PASTE", { target: [toZone("A2")] });
      expect(getCellContent(model, "B1")).toBe("1");
      expect(getCellContent(model, "C1")).toBe("2");
      expect(getCellContent(model, "A2")).toBe("");
      expect(getCellContent(model, "B2")).toBe("");
      expect(getCellContent(model, "C2")).toBe("");
    });

    test("adding a column after a cut zone is not invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "B1", "2");

      model.dispatch("CUT", { target: target("A1:B1") });
      addColumns(model, "after", "B", 1);
      model.dispatch("PASTE", { target: [toZone("A2")] });
      expect(getCellContent(model, "A1")).toBe("");
      expect(getCellContent(model, "B1")).toBe("");
      expect(getCellContent(model, "A2")).toBe("1");
      expect(getCellContent(model, "B2")).toBe("2");
    });

    test("adding a column inside a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "B1", "2");

      model.dispatch("CUT", { target: target("A1:B1") });
      addColumns(model, "after", "A", 1);
      model.dispatch("PASTE", { target: [toZone("A2")] });
      expect(getCellContent(model, "A1")).toBe("1");
      expect(getCellContent(model, "C1")).toBe("2");
      expect(getCellContent(model, "A2")).toBe("");
      expect(getCellContent(model, "C2")).toBe("");
    });

    test("adding multipe columns inside a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "B1", "2");

      model.dispatch("CUT", { target: target("A1:B1") });
      addColumns(model, "after", "A", 5);
      model.dispatch("PASTE", { target: [toZone("A2")] });
      expect(getCellContent(model, "A1")).toBe("1");
      expect(getCellContent(model, "G1")).toBe("2");
      expect(getCellContent(model, "A2")).toBe("");
      expect(getCellContent(model, "C2")).toBe("");
    });

    test("adding a row before a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "A2", "2");

      model.dispatch("CUT", { target: target("A1:A2") });
      addRows(model, "before", 0, 1);
      model.dispatch("PASTE", { target: [toZone("C1")] });
      expect(getCellContent(model, "A2")).toBe("1");
      expect(getCellContent(model, "A3")).toBe("2");
      expect(getCellContent(model, "C1")).toBe("");
      expect(getCellContent(model, "C2")).toBe("");
      expect(getCellContent(model, "C3")).toBe("");
    });

    test("adding a row after a cut zone is not invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "A2", "2");

      model.dispatch("CUT", { target: target("A1:A2") });
      addRows(model, "after", 2, 1);
      model.dispatch("PASTE", { target: [toZone("C1")] });
      expect(getCellContent(model, "A1")).toBe("");
      expect(getCellContent(model, "A2")).toBe("");
      expect(getCellContent(model, "C1")).toBe("1");
      expect(getCellContent(model, "C2")).toBe("2");
    });

    test("adding a row inside a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "A2", "2");

      model.dispatch("CUT", { target: target("A1:A2") });
      addRows(model, "after", 0, 1);
      model.dispatch("PASTE", { target: [toZone("C1")] });
      expect(getCellContent(model, "A1")).toBe("1");
      expect(getCellContent(model, "A3")).toBe("2");
      expect(getCellContent(model, "C1")).toBe("");
      expect(getCellContent(model, "C3")).toBe("");
    });

    test("adding multiple rows inside a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "A1", "1");
      setCellContent(model, "A2", "2");

      model.dispatch("CUT", { target: target("A1:A2") });
      addRows(model, "after", 0, 5);
      model.dispatch("PASTE", { target: [toZone("C1")] });
      expect(getCellContent(model, "A1")).toBe("1");
      expect(getCellContent(model, "A7")).toBe("2");
      expect(getCellContent(model, "C1")).toBe("");
      expect(getCellContent(model, "C3")).toBe("");
    });
  });

  describe("remove col/row can invalidate the clipboard of cut", () => {
    test("removing a column before a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "B2", "1");
      setCellContent(model, "C2", "2");

      model.dispatch("CUT", { target: target("B2:C2") });
      deleteColumns(model, ["A"]);
      model.dispatch("PASTE", { target: [toZone("D1")] });
      expect(getCellContent(model, "A2")).toBe("1");
      expect(getCellContent(model, "B2")).toBe("2");
      expect(getCellContent(model, "D1")).toBe("");
      expect(getCellContent(model, "E1")).toBe("");
    });

    test("removing a column after a cut zone is not invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "B2", "1");
      setCellContent(model, "C2", "2");

      model.dispatch("CUT", { target: target("B2:C2") });
      deleteColumns(model, ["D"]);
      model.dispatch("PASTE", { target: [toZone("D1")] });
      expect(getCellContent(model, "B2")).toBe("");
      expect(getCellContent(model, "C2")).toBe("");
      expect(getCellContent(model, "D1")).toBe("1");
      expect(getCellContent(model, "E1")).toBe("2");
    });

    test("removing a column inside a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "B2", "1");
      setCellContent(model, "C2", "2");

      model.dispatch("CUT", { target: target("B2:C2") });
      deleteColumns(model, ["C"]);
      model.dispatch("PASTE", { target: [toZone("D1")] });
      expect(getCellContent(model, "B2")).toBe("1");
      expect(getCellContent(model, "D1")).toBe("");
    });

    test("removing a row before a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "B2", "1");
      setCellContent(model, "C2", "2");

      model.dispatch("CUT", { target: target("B2:C2") });
      deleteRows(model, [0]);
      model.dispatch("PASTE", { target: [toZone("D1")] });
      expect(getCellContent(model, "B1")).toBe("1");
      expect(getCellContent(model, "C1")).toBe("2");
      expect(getCellContent(model, "D1")).toBe("");
      expect(getCellContent(model, "E1")).toBe("");
    });

    test("removing a row after a cut zone is not invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "B2", "1");
      setCellContent(model, "C2", "2");

      model.dispatch("CUT", { target: target("B2:C2") });
      deleteRows(model, [3]);
      model.dispatch("PASTE", { target: [toZone("D1")] });
      expect(getCellContent(model, "B2")).toBe("");
      expect(getCellContent(model, "C2")).toBe("");
      expect(getCellContent(model, "D1")).toBe("1");
      expect(getCellContent(model, "E1")).toBe("2");
    });

    test("removing a row inside a cut zone is invalidating the clipboard", () => {
      const model = new Model();
      setCellContent(model, "B2", "1");
      setCellContent(model, "B3", "2");

      model.dispatch("CUT", { target: target("B2:B3") });
      deleteRows(model, [2]);
      model.dispatch("PASTE", { target: [toZone("D1")] });
      expect(getCellContent(model, "B2")).toBe("1");
      expect(getCellContent(model, "D1")).toBe("");
    });
  });
});
