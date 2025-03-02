import { arg, functionRegistry } from "../../src/functions";
import { toNumber } from "../../src/functions/helpers";
import { Model } from "../../src/model";
import {
  Arg,
  ArgValue,
  CellValue,
  ComputeFunction,
  DEFAULT_LOCALE,
  ErrorCell,
  Format,
  Matrix,
  Maybe,
  ValueAndFormat,
  isMatrix,
} from "../../src/types";
import {
  addColumns,
  addRows,
  cut,
  deleteColumns,
  deleteContent,
  deleteRows,
  paste,
  setCellContent,
  setFormat,
} from "../test_helpers/commands_helpers";
import { getCellContent, getEvaluatedCell } from "../test_helpers/getters_helpers";
import { restoreDefaultFunctions, target } from "../test_helpers/helpers";

let model: Model;
describe("evaluate formulas that return an array", () => {
  beforeEach(() => {
    model = new Model();
    functionRegistry.add("MFILL", {
      description: "Return an n*n matrix filled with n.",
      args: [
        arg("n (number)", "number of column of the matrix"),
        arg("m (number)", "number of row of the matrix"),
        arg("v (number)", "value to fill matrix"),
      ],
      returns: ["RANGE<NUMBER>"],
      compute: function (n: Maybe<CellValue>, m: Maybe<CellValue>, v: Maybe<CellValue>): any[][] {
        return Array.from({ length: toNumber(n, DEFAULT_LOCALE) }, (_, i) =>
          Array.from({ length: toNumber(m, DEFAULT_LOCALE) }, (_, j) => v)
        );
      } as ComputeFunction<ArgValue, CellValue | Matrix<CellValue>>,
    });

    functionRegistry.add("TRANSPOSE", {
      description: "Transpose a matrix.",
      args: [arg("matrix (range<number>)", "The matrix to be transposed.")],
      returns: ["NUMBER"],
      compute: function (values) {
        if (isMatrix(values)) {
          return Array.from({ length: values[0].length }, (_, i) =>
            Array.from({ length: values.length }, (_, j) => values[j][i])
          );
        }
        return [[values]];
      } as ComputeFunction<ArgValue, CellValue | Matrix<CellValue>>,
      isExported: true,
    });
  });

  afterEach(() => {
    restoreDefaultFunctions();
  });

  test("a simple reference to a range cannot return an array", () => {
    setCellContent(model, "A1", "=A2:A3");
    expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
  });

  test("can spread array", () => {
    setCellContent(model, "A1", "=MFILL(2, 2, 42)");
    expect(getEvaluatedCell(model, "A1").value).toBe(42);
    expect(getEvaluatedCell(model, "A2").value).toBe(42);
    expect(getEvaluatedCell(model, "B1").value).toBe(42);
    expect(getEvaluatedCell(model, "B2").value).toBe(42);
  });

  test("can use result array in formula that accept array", () => {
    setCellContent(model, "A1", "=SUM(MFILL(2, 2, 42))");
    expect(getEvaluatedCell(model, "A1").value).toBe(168);
  });

  test("can't use result array in formula that accept scalar only", () => {
    setCellContent(model, "A1", "=ABS(MFILL(2, 2, -42))");
    expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
  });

  test("can use 1x1 result array in formula that accept scalar", () => {
    setCellContent(model, "A1", "=ABS(MFILL(1, 1, -42))");
    expect(getEvaluatedCell(model, "A1").value).toBe(42);
  });

  test("reference to a formula result array is possible", () => {
    setCellContent(model, "E5", "=B2");
    setCellContent(model, "A1", "=MFILL(3,3,42)");
    setCellContent(model, "D4", "=C3");
    expect(getEvaluatedCell(model, "E5").value).toBe(42);
    expect(getEvaluatedCell(model, "D4").value).toBe(42);
  });

  test("reference to a formula result array is null when removing the array formula", () => {
    setCellContent(model, "E5", "=B2");
    setCellContent(model, "A1", "=MFILL(3,3,42)");
    setCellContent(model, "D4", "=C3");
    setCellContent(model, "A1", "");
    expect(getEvaluatedCell(model, "E5").value).toBe(0);
    expect(getEvaluatedCell(model, "D4").value).toBe(0);
  });

  describe("spread matrix with format", () => {
    test("can spread matrix of values with matrix of format", () => {
      functionRegistry.add("MATRIX.2.2", {
        description: "Return an 2*2 matrix with some values",
        args: [],
        returns: ["RANGE<NUMBER>"],
        compute: () => [
          [1, 2],
          [3, 4],
        ],
        computeFormat: () => [
          ["0.00", undefined],
          ["0.00", undefined],
        ],
      });

      setFormat(model, "0%", target("A1:A2"));
      setCellContent(model, "A1", "=MATRIX.2.2()");

      expect(getCellContent(model, "A1")).toBe("100%");
      expect(getCellContent(model, "A2")).toBe("200%");

      expect(getCellContent(model, "B1")).toBe("3.00");
      expect(getCellContent(model, "B2")).toBe("4");
    });

    test("can spread matrix of values with scalar format returns an error", () => {
      functionRegistry.add("MATRIX.2.2", {
        description: "Return an 2*2 matrix with some values",
        args: [],
        returns: ["RANGE<NUMBER>"],
        compute: () => [
          [1, 2],
          [3, 4],
        ],
        computeFormat: () => "0.00",
      });

      setFormat(model, "0%", target("A1:A2"));
      setCellContent(model, "A1", "=MATRIX.2.2()");

      expect(getCellContent(model, "A1")).toBe("#ERROR");
      expect(getCellContent(model, "A2")).toBe("");
      expect(getCellContent(model, "B1")).toBe("");
      expect(getCellContent(model, "B2")).toBe("");
    });

    test("cannot spread simple value with matrix of format", () => {
      functionRegistry.add("SIMPLE.VALUE", {
        description: "Return an 2*2 matrix with some values",
        args: [],
        returns: ["NUMBER"],
        compute: () => 1,
        computeFormat: () => [
          ["0.00", undefined],
          ["0.00", undefined],
        ],
      });

      setCellContent(model, "A1", "=SIMPLE.VALUE()");
      setCellContent(model, "A2", "42");
      setCellContent(model, "B1", "24");
      setCellContent(model, "B2", "22");

      expect(getCellContent(model, "A1")).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A1") as ErrorCell).error.message).toBe(
        "A format matrix should never be associated with a scalar value"
      );
      expect(getCellContent(model, "A2")).toBe("42");
      expect(getCellContent(model, "B1")).toBe("24");
      expect(getCellContent(model, "B2")).toBe("22");
    });

    test("can spread matrix of format depending on matrix of format", () => {
      functionRegistry.add("MATRIX", {
        description: "Return the matrix passed as argument",
        args: [arg("matrix (range<number>)", "a matrix")],
        returns: ["RANGE<NUMBER>"],
        compute: ((matrix) => matrix) as ComputeFunction<ArgValue, Matrix<CellValue>>,
        computeFormat: ((matrix: Matrix<ValueAndFormat>) =>
          matrix.map((row) => row.map((item) => item?.format))) as ComputeFunction<
          Arg,
          Matrix<Format | undefined>
        >,
      });

      setCellContent(model, "A1", "42");
      setCellContent(model, "A2", "24");

      setFormat(model, "0%", target("A1"));
      setFormat(model, "0.00", target("A2"));

      setCellContent(model, "B1", "=MATRIX(A1:A2)");

      expect(getCellContent(model, "B1")).toBe("4200%");
      expect(getCellContent(model, "B2")).toBe("24.00");

      setCellContent(model, "C1", "=MATRIX(B1:B2)");

      expect(getCellContent(model, "C1")).toBe("4200%");
      expect(getCellContent(model, "C2")).toBe("24.00");
    });
  });

  describe("cut/past reference", () => {
    test("reference to a spread is keep when we cut/past the spread formula", () => {
      setCellContent(model, "A1", "=MFILL(2,2,42)");
      setCellContent(model, "A3", "=B2");
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      cut(model, "A1:B2");
      paste(model, "C1");
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      setCellContent(model, "C1", "=MFILL(2,2,24)");
      expect(getEvaluatedCell(model, "A3").value).toBe(24);
    });

    test("references to a spread are keep when we cut/past the spread formula", () => {
      setCellContent(model, "A1", "=MFILL(2,2,42)");
      setCellContent(model, "A3", "=TRANSPOSE(A1:B2)");
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      expect(getEvaluatedCell(model, "B4").value).toBe(42);
      cut(model, "A1:B2");
      paste(model, "C1");
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      expect(getEvaluatedCell(model, "B4").value).toBe(42);
      setCellContent(model, "C1", "=MFILL(2,2,24)");
      expect(getEvaluatedCell(model, "A3").value).toBe(24);
      expect(getEvaluatedCell(model, "B4").value).toBe(24);
    });

    test("reference to a spread is keep when we cut/past the reference", () => {
      setCellContent(model, "A1", "=MFILL(2,2,42)");
      setCellContent(model, "A3", "=B2");
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      cut(model, "A3");
      paste(model, "C3");
      expect(getEvaluatedCell(model, "C3").value).toBe(42);
      setCellContent(model, "A1", "=MFILL(2,2,24)");
      expect(getEvaluatedCell(model, "C3").value).toBe(24);
    });

    test("references to a spread are keep when we cut/past the references", () => {
      setCellContent(model, "A1", "=MFILL(2,2,42)");
      setCellContent(model, "A3", "=TRANSPOSE(A1:B2)");
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      expect(getEvaluatedCell(model, "B4").value).toBe(42);
      cut(model, "A3:B4");
      paste(model, "C3");
      expect(getEvaluatedCell(model, "C3").value).toBe(42);
      expect(getEvaluatedCell(model, "D4").value).toBe(42);
      setCellContent(model, "A1", "=MFILL(2,2,24)");
      expect(getEvaluatedCell(model, "C3").value).toBe(24);
      expect(getEvaluatedCell(model, "D4").value).toBe(24);
    });
  });

  describe("result array can collides with other cell", () => {
    test("throw error on the formula when collide with cell having content", () => {
      setCellContent(model, "B2", "kikou");
      setCellContent(model, "A1", "=MFILL(2,2, 42)");
      expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A1") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in B2."
      );

      setCellContent(model, "A4", "kikou");
      setCellContent(model, "A3", "=MFILL(2,2, 42)");
      expect(getEvaluatedCell(model, "A3").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A3") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in A4."
      );
    });

    test("throw error on the formula when collide with other formula ", () => {
      setCellContent(model, "B2", "=SUM(42+24)");
      setCellContent(model, "A1", "=MFILL(2,2, 42)");
      expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A1") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in B2."
      );
      expect(getEvaluatedCell(model, "A2").value).toBe("");
      expect(getEvaluatedCell(model, "B1").value).toBe("");
      expect(getEvaluatedCell(model, "B2").value).toBe(66);
    });

    test("throw error message concerning the first cell encountered vertically", () => {
      setCellContent(model, "A1", "=MFILL(1,3, 42)");
      setCellContent(model, "A2", "kikou");
      setCellContent(model, "A3", "kikou");
      expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A1") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in A2."
      );
    });

    test("throw error message concerning the first cell encountered horizontally", () => {
      setCellContent(model, "A1", "=MFILL(3,1, 42)");
      setCellContent(model, "B1", "kikou");
      setCellContent(model, "C1", "kikou");
      expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A1") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in B1."
      );
    });

    describe("do not spread result when collide", () => {
      test("write collision first", () => {
        setCellContent(model, "B2", "kikou");
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        expect(getEvaluatedCell(model, "A2").value).toBe("");
        expect(getEvaluatedCell(model, "B1").value).toBe("");
        expect(getEvaluatedCell(model, "B2").value).toBe("kikou");
      });

      test("write formula first", () => {
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B2", "kikou");
        expect(getEvaluatedCell(model, "A2").value).toBe("");
        expect(getEvaluatedCell(model, "B1").value).toBe("");
        expect(getEvaluatedCell(model, "B2").value).toBe("kikou");
      });

      test("do not spread result when collision removed then added again", () => {
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B2", "kikou");
        setCellContent(model, "B2", "");
        setCellContent(model, "B2", "kikou");
        expect(getEvaluatedCell(model, "A2").value).toBe("");
        expect(getEvaluatedCell(model, "B1").value).toBe("");
        expect(getEvaluatedCell(model, "B2").value).toBe("kikou");
      });
    });

    describe("spread result when remove collision", () => {
      test("write collision first", () => {
        setCellContent(model, "B2", "kikou");
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B2", "");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);
        expect(getEvaluatedCell(model, "A2").value).toBe(42);
        expect(getEvaluatedCell(model, "B1").value).toBe(42);
        expect(getEvaluatedCell(model, "B2").value).toBe(42);
      });

      test("write formula first", () => {
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B2", "kikou");
        setCellContent(model, "B2", "");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);
        expect(getEvaluatedCell(model, "A2").value).toBe(42);
        expect(getEvaluatedCell(model, "B1").value).toBe(42);
        expect(getEvaluatedCell(model, "B2").value).toBe(42);
      });
    });

    describe("spread result when remove several collision", () => {
      test("write collision first", () => {
        setCellContent(model, "B1", "kikou 1");
        setCellContent(model, "B2", "kikou 2");
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        deleteContent(model, ["B1:B2"]);
        expect(getEvaluatedCell(model, "A1").value).toBe(42);
        expect(getEvaluatedCell(model, "A2").value).toBe(42);
        expect(getEvaluatedCell(model, "B1").value).toBe(42);
        expect(getEvaluatedCell(model, "B2").value).toBe(42);
      });

      test("write formula first", () => {
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B1", "kikou 1");
        setCellContent(model, "B2", "kikou 2");
        deleteContent(model, ["B1:B2"]);
        expect(getEvaluatedCell(model, "A1").value).toBe(42);
        expect(getEvaluatedCell(model, "A2").value).toBe(42);
        expect(getEvaluatedCell(model, "B1").value).toBe(42);
        expect(getEvaluatedCell(model, "B2").value).toBe(42);
      });
    });

    describe("keep collide when change collision", () => {
      test("write collision first", () => {
        setCellContent(model, "B2", "kikou");
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B2", "Aquecoucou");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
        expect(getEvaluatedCell(model, "A2").value).toBe("");
        expect(getEvaluatedCell(model, "B1").value).toBe("");
        expect(getEvaluatedCell(model, "B2").value).toBe("Aquecoucou");
      });

      test("write formula first", () => {
        setCellContent(model, "A1", "=MFILL(2,2, 42)");
        setCellContent(model, "B2", "kikou");
        setCellContent(model, "B2", "Aquecoucou");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
        expect(getEvaluatedCell(model, "A2").value).toBe("");
        expect(getEvaluatedCell(model, "B1").value).toBe("");
        expect(getEvaluatedCell(model, "B2").value).toBe("Aquecoucou");
      });
    });

    describe("collision tests on several limit positions", () => {
      test("limit located on the formula column", () => {
        setCellContent(model, "A1", "=MFILL(3,3,42)");
        setCellContent(model, "A4", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);

        setCellContent(model, "A3", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      });

      test("limit located on the formula row", () => {
        setCellContent(model, "A1", "=MFILL(3,3,42)");
        setCellContent(model, "D1", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);

        setCellContent(model, "C1", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      });

      test("limit located before the formula column", () => {
        setCellContent(model, "B1", "=MFILL(3,3,42)");
        setCellContent(model, "A3", "kikou");
        expect(getEvaluatedCell(model, "B1").value).toBe(42);
      });

      test("limit located before the formula row", () => {
        setCellContent(model, "A2", "=MFILL(3,3,42)");
        setCellContent(model, "C1", "kikou");
        expect(getEvaluatedCell(model, "A2").value).toBe(42);
      });

      test("limit located adter the formula column", () => {
        setCellContent(model, "A1", "=MFILL(1,3,42)");
        setCellContent(model, "B3", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);

        setCellContent(model, "A1", "=MFILL(2,3,42)");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      });

      test("limit located after the formula row", () => {
        setCellContent(model, "A1", "=MFILL(1,3,42)");
        setCellContent(model, "C2", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);

        setCellContent(model, "A1", "=MFILL(3,2,42)");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      });

      test("multiple limit test", () => {
        setCellContent(model, "A1", "=MFILL(5,3,42)");
        setCellContent(model, "B4", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);
        setCellContent(model, "C5", "kikou");
        expect(getEvaluatedCell(model, "A1").value).toBe(42);
        setCellContent(model, "D3", "colision");
        expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      });
    });
  });

  describe("result array can collides with sheet borders", () => {
    let model: Model;
    beforeEach(() => {
      model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 3,
          },
        ],
      });
    });

    test("throw error message concerning the column encountered horizontally", () => {
      setCellContent(model, "B1", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "B1").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "B1") as ErrorCell).error.message).toBe(
        "Result couldn't be automatically expanded. Please insert more columns."
      );
    });

    test("throw error message concerning the row encountered verticaly", () => {
      setCellContent(model, "A2", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "A2").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A2") as ErrorCell).error.message).toBe(
        "Result couldn't be automatically expanded. Please insert more rows."
      );
    });

    test("throw error message concerning the row and column encountered", () => {
      setCellContent(model, "B2", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "B2").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "B2") as ErrorCell).error.message).toBe(
        "Result couldn't be automatically expanded. Please insert more columns and rows."
      );
    });

    test("do not spread result when collide", () => {
      setCellContent(model, "B2", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "B2").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "B3").value).toBe("");
      expect(getEvaluatedCell(model, "C2").value).toBe("");
      expect(getEvaluatedCell(model, "C3").value).toBe("");
    });

    test("spread result when add columns", () => {
      setCellContent(model, "C1", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "C1").value).toBe("#ERROR");

      addColumns(model, "after", "C", 1);
      expect(getEvaluatedCell(model, "C1").value).toBe("#ERROR");

      addColumns(model, "after", "D", 1);
      expect(getEvaluatedCell(model, "C1").value).toBe(42);
      expect(getEvaluatedCell(model, "E3").value).toBe(42);
    });

    test("spread result when add rows", () => {
      setCellContent(model, "A3", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "A3").value).toBe("#ERROR");

      addRows(model, "after", 2, 1);
      expect(getEvaluatedCell(model, "A3").value).toBe("#ERROR");

      addRows(model, "after", 3, 1);
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      expect(getEvaluatedCell(model, "C5").value).toBe(42);
    });

    test("do not spread result when delete columns", () => {
      setCellContent(model, "A1", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "A1").value).toBe(42);
      expect(getEvaluatedCell(model, "C3").value).toBe(42);

      deleteColumns(model, ["B"]);
      expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "B1").value).toBe("");
    });

    test("do not spread result when delete rows", () => {
      setCellContent(model, "A1", "=MFILL(3,3, 42)");
      expect(getEvaluatedCell(model, "A1").value).toBe(42);
      expect(getEvaluatedCell(model, "C3").value).toBe(42);

      deleteRows(model, [2]);
      expect(getEvaluatedCell(model, "A1").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "A2").value).toBe("");
    });
  });

  describe("a formula that refers to a result array must always have the same result", () => {
    const ref = "=C3";
    const formula = "=MFILL(3,3,42)";
    const result = 42;

    describe("regardless the position of the result array", () => {
      test("reference located at the top/left of the result array", () => {
        setCellContent(model, "A1", ref);
        setCellContent(model, "B2", formula);
        expect(getEvaluatedCell(model, "A1").value).toBe(result);
      });

      test("reference located at the top/right of the result array", () => {
        setCellContent(model, "E1", ref);
        setCellContent(model, "B2", formula);
        expect(getEvaluatedCell(model, "E1").value).toBe(result);
      });

      test("reference located at the bottom/left of the result array", () => {
        setCellContent(model, "A5", ref);
        setCellContent(model, "B2", formula);
        expect(getEvaluatedCell(model, "A5").value).toBe(result);
      });

      test("reference located at the bottom/right of the result array", () => {
        setCellContent(model, "E5", ref);
        setCellContent(model, "B2", formula);
        expect(getEvaluatedCell(model, "E5").value).toBe(result);
      });
    });

    describe("regardless the order we set the formulas", () => {
      test("reference located at the top/left of the result array, set the formula ref first", () => {
        setCellContent(model, "A1", ref);
        setCellContent(model, "B2", formula);
        expect(getEvaluatedCell(model, "A1").value).toBe(result);
      });

      test("reference located at the top/left of the result array, set the result array first", () => {
        setCellContent(model, "B2", formula);
        setCellContent(model, "A1", ref);
        expect(getEvaluatedCell(model, "A1").value).toBe(result);
      });

      test("reference located at the bottom/right of the result array, set the formula ref first", () => {
        setCellContent(model, "E5", ref);
        setCellContent(model, "B2", formula);
        expect(getEvaluatedCell(model, "E5").value).toBe(result);
      });

      test("reference located at the bottom/right of the result array, set the result array first", () => {
        setCellContent(model, "B2", formula);
        setCellContent(model, "E5", ref);
        expect(getEvaluatedCell(model, "E5").value).toBe(result);
      });
    });
  });

  describe("formula with spread dependencies", () => {
    test("formula with own spread dependencies have only one cycle", () => {
      setCellContent(model, "A1", "=MFILL(2,2,B1+1)");
      expect(getEvaluatedCell(model, "A1").value).toBe(1);
      expect(getEvaluatedCell(model, "A2").value).toBe(1);
      expect(getEvaluatedCell(model, "B1").value).toBe(1);
      expect(getEvaluatedCell(model, "B2").value).toBe(1);
    });

    test("formulas with cross spread dependencies depends on a cycle limit", () => {
      setCellContent(model, "A1", "=MFILL(2,1,D1+1)");
      setCellContent(model, "C1", "=MFILL(2,1,B1+1)");
      expect(getEvaluatedCell(model, "A1").value).toBe(31);
      expect(getEvaluatedCell(model, "B1").value).toBe(31);
      expect(getEvaluatedCell(model, "C1").value).toBe(32);
      expect(getEvaluatedCell(model, "D1").value).toBe(32);
    });

    test("Spreaded formulas with range deps Do not invalidate themselves on evaluation", () => {
      let c = 0;
      functionRegistry.add("INCREMENTONEVAL", {
        description: "returns the input, but fancy. Like transpose(transpose(range))",
        args: [arg("range (any, range<any>)", "The matrix to be transposed.")],
        returns: ["RANGE<ANY>"],
        compute: function (values) {
          c++;
          return values;
        } as ComputeFunction<ArgValue, CellValue>,
        isExported: true,
      });
      setCellContent(model, "A1", "0");
      setCellContent(model, "A2", "1");
      setCellContent(model, "A3", "2");
      setCellContent(model, "A4", "3");
      setCellContent(model, "A5", "=INCREMENTONEVAL(A2:A3)");
      expect(c).toEqual(1);
      setCellContent(model, "A5", "=INCREMENTONEVAL(A1:A2)");
      expect(c).toEqual(2);
      setCellContent(model, "A5", "=INCREMENTONEVAL(A1:B2)");
      expect(c).toEqual(3);
    });

    test("Spreaded formulas with range deps invalidate only once the dependencies of themselves", () => {
      let c = 0;
      functionRegistry.add("INCREMENTONEVAL", {
        description: "",
        args: [arg("range (any, range<any>)", "")],
        returns: ["RANGE<ANY>"],
        compute: function () {
          c++;
          return 5;
        } as ComputeFunction<ArgValue, CellValue>,
        isExported: false,
      });
      setCellContent(model, "A1", "0");
      setCellContent(model, "A2", "1");
      setCellContent(model, "A5", "=TRANSPOSE(A1:A2)");
      setCellContent(model, "B1", "=INCREMENTONEVAL(A5)"); // depends on array formula (main cell)
      expect(c).toEqual(1);
      setCellContent(model, "A2", "2");
      expect(c).toEqual(2);
    });

    test("Spreaded formulas with range deps invalidate only once the dependencies of result", () => {
      let c = 0;
      functionRegistry.add("INCREMENTONEVAL", {
        description: "",
        args: [arg("range (any, range<any>)", "")],
        returns: ["RANGE<ANY>"],
        compute: function () {
          c++;
          return 5;
        } as ComputeFunction<ArgValue, CellValue>,
        isExported: false,
      });
      setCellContent(model, "A1", "0");
      setCellContent(model, "A2", "1");
      setCellContent(model, "A5", "=TRANSPOSE(A1:A2)");
      setCellContent(model, "B1", "=INCREMENTONEVAL(B5)"); // depends on array formula (not the main cell)
      expect(c).toEqual(1);
      setCellContent(model, "A2", "2");
      expect(c).toEqual(2);
    });

    test("have collision when spread size zone change", () => {
      setCellContent(model, "A1", "1");
      setCellContent(model, "B1", "=MFILL(1,A1+1,42)");
      setCellContent(model, "A3", "=TRANSPOSE(B1:B2)");

      expect(getEvaluatedCell(model, "B1").value).toBe(42);
      expect(getEvaluatedCell(model, "B2").value).toBe(42);

      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      expect(getEvaluatedCell(model, "B3").value).toBe(42);

      setCellContent(model, "A1", "2");

      expect(getEvaluatedCell(model, "B1").value).toBe(42);
      expect(getEvaluatedCell(model, "B2").value).toBe(42);
      expect(getEvaluatedCell(model, "B3").value).toBe(42);

      expect(getEvaluatedCell(model, "A3").value).toBe("#ERROR");
    });

    test("recompute cell depending on spread values computed in between", () => {
      const model = new Model({
        sheets: [
          {
            name: "sheet1",
            cells: { A1: { content: "=sheet2!A4" } },
          },
          {
            name: "sheet2",
            cells: {
              A1: { content: "=MFILL(1,3,42)" },
              A4: { content: "=MEDIAN(A2:A3)" }, // depends only on spread values (not on sheet2!A1)
            },
          },
        ],
      });
      // initially, cells are evaluated in this order: [sheet1!A1, sheet2!A1, sheet2!A4]
      expect(getEvaluatedCell(model, "A1").value).toBe(42);
    });
  });

  describe("result array can collides with other result array", () => {
    test("throw error on the formula when collide", () => {
      const formula = "=MFILL(2,2,42)";
      setCellContent(model, "B1", formula);
      setCellContent(model, "A2", formula);
      expect(getEvaluatedCell(model, "B1").value).toBe(42);
      expect(getEvaluatedCell(model, "A2").value).toBe("#ERROR");
      expect((getEvaluatedCell(model, "A2") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in B2."
      );
    });

    test("throw error message concerning the first cell encountered vertically", () => {
      setCellContent(model, "A2", "=MFILL(2,2,42)");
      setCellContent(model, "B1", "=MFILL(1,3,42)");
      expect(getEvaluatedCell(model, "B1").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "A2").value).toBe(42);
      expect((getEvaluatedCell(model, "B1") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in B2."
      );
    });

    test("throw error message concerning the first cell encountered horizontally", () => {
      setCellContent(model, "A2", "=MFILL(3,1,42)");
      setCellContent(model, "B1", "=MFILL(2,2,42)");
      expect(getEvaluatedCell(model, "B1").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "A2").value).toBe(42);
      expect((getEvaluatedCell(model, "B1") as ErrorCell).error.message).toBe(
        "Array result was not expanded because it would overwrite data in B2."
      );
    });

    test("do not spread result when collide", () => {
      const formula = "=MFILL(2,2,42)";
      setCellContent(model, "B1", formula);
      setCellContent(model, "A2", formula);
      expect(getEvaluatedCell(model, "B1").value).toBe(42);
      expect(getEvaluatedCell(model, "B2").value).toBe(42);
      expect(getEvaluatedCell(model, "A2").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "A3").value).toBe("");
      expect(getEvaluatedCell(model, "B3").value).toBe("");
    });

    test("spread result when remove collision", () => {
      setCellContent(model, "B1", "=MFILL(2,2,24)");
      setCellContent(model, "A2", "=MFILL(2,2,42)");
      expect(getEvaluatedCell(model, "B1").value).toBe(24);
      expect(getEvaluatedCell(model, "B2").value).toBe(24);
      expect(getEvaluatedCell(model, "A2").value).toBe("#ERROR");
      expect(getEvaluatedCell(model, "A3").value).toBe("");
      expect(getEvaluatedCell(model, "B3").value).toBe("");
      setCellContent(model, "B1", "");
      expect(getEvaluatedCell(model, "B1").value).toBe("");
      expect(getEvaluatedCell(model, "A2").value).toBe(42);
      expect(getEvaluatedCell(model, "A3").value).toBe(42);
      expect(getEvaluatedCell(model, "B2").value).toBe(42);
      expect(getEvaluatedCell(model, "B3").value).toBe(42);
    });

    describe("collision tests on several limit positions", () => {
      const result = 42;
      const formula = "=MFILL(2,2,42)";

      test("covering formula located on the covered formula columns", () => {
        setCellContent(model, "B4", formula);
        setCellContent(model, "C3", formula);
        expect(getEvaluatedCell(model, "B4").value).toBe(result);
        expect(getEvaluatedCell(model, "C3").value).toBe("#ERROR");
      });

      test("covering formula located on the covered formula rows", () => {
        setCellContent(model, "C3", formula);
        setCellContent(model, "D2", formula);
        expect(getEvaluatedCell(model, "C3").value).toBe(result);
        expect(getEvaluatedCell(model, "D2").value).toBe("#ERROR");
      });

      test("covering formula located before the covered formula columns", () => {
        setCellContent(model, "A4", formula);
        setCellContent(model, "C3", formula);
        expect(getEvaluatedCell(model, "A4").value).toBe(result);
        expect(getEvaluatedCell(model, "C3").value).toBe(result);
      });

      test("covering formula located before the covered formula rows", () => {
        setCellContent(model, "C3", formula);
        setCellContent(model, "D1", formula);
        expect(getEvaluatedCell(model, "D1").value).toBe(result);
        expect(getEvaluatedCell(model, "C3").value).toBe(result);
      });

      test("covering formula located after the covered formula columns", () => {
        setCellContent(model, "C3", formula);
        setCellContent(model, "E4", formula);
        expect(getEvaluatedCell(model, "E4").value).toBe(result);
        expect(getEvaluatedCell(model, "C3").value).toBe(result);
      });

      test("covering formula located after the covered formula rows", () => {
        setCellContent(model, "C3", formula);
        setCellContent(model, "D5", formula);
        expect(getEvaluatedCell(model, "D5").value).toBe(result);
        expect(getEvaluatedCell(model, "C3").value).toBe(result);
      });
    });

    describe("throw error according to the order we set the formula", () => {
      const result = 42;
      const formula = "=MFILL(2,2,42)";
      test("order 1: set A2, set B1 --> error on B1", () => {
        setCellContent(model, "A2", formula);
        setCellContent(model, "B1", formula);
        expect(getEvaluatedCell(model, "A2").value).toBe(result);
        expect(getEvaluatedCell(model, "B1").value).toBe("#ERROR");
      });

      test("order 2: set B1, set A2 --> error on A2", () => {
        setCellContent(model, "B1", formula);
        setCellContent(model, "A2", formula);
        expect(getEvaluatedCell(model, "A2").value).toBe("#ERROR");
        expect(getEvaluatedCell(model, "B1").value).toBe(result);
      });
    });

    describe("throw error regardless the order we get the result", () => {
      const result = 42;
      const formula = "=MFILL(2,2,42)";
      test("order 1: get A2, get B1", () => {
        setCellContent(model, "A2", formula);
        setCellContent(model, "B1", formula);
        expect(getEvaluatedCell(model, "A2").value).toBe(result);
        expect(getEvaluatedCell(model, "B1").value).toBe("#ERROR");
      });

      test("order 2: get B1, get A2", () => {
        setCellContent(model, "A2", formula);
        setCellContent(model, "B1", formula);
        expect(getEvaluatedCell(model, "B1").value).toBe("#ERROR");
        expect(getEvaluatedCell(model, "A2").value).toBe(result);
      });
    });
  });
});
