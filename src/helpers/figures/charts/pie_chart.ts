import type {
  BubbleDataPoint,
  ChartConfiguration,
  ChartDataset,
  LegendOptions,
  Point,
} from "chart.js";
import { DeepPartial } from "chart.js/dist/types/utils";
import { BACKGROUND_CHART_COLOR, INCORRECT_RANGE_STRING } from "../../../constants";
import {
  AddColumnsRowsCommand,
  ApplyRangeChange,
  Color,
  CommandResult,
  CoreGetters,
  Getters,
  LocaleFormat,
  Range,
  RemoveColumnsRowsCommand,
  UID,
} from "../../../types";
import {
  ChartCreationContext,
  DataSet,
  DatasetValues,
  ExcelChartDataset,
  ExcelChartDefinition,
} from "../../../types/chart/chart";
import { LegendPosition } from "../../../types/chart/common_chart";
import { PieChartDefinition, PieChartRuntime } from "../../../types/chart/pie_chart";
import { Validator } from "../../../types/validator";
import { toXlsxHexColor } from "../../../xlsx/helpers/colors";
import { formatValue } from "../../format";
import { largeMax } from "../../misc";
import { createValidRange } from "../../range";
import { AbstractChart } from "./abstract_chart";
import {
  ChartColors,
  chartFontColor,
  checkDataset,
  checkLabelRange,
  copyDataSetsWithNewSheetId,
  copyLabelRangeWithNewSheetId,
  createDataSets,
  shouldRemoveFirstLabel,
  toExcelDataset,
  toExcelLabelRange,
  transformChartDefinitionWithDataSetsWithZone,
  updateChartRangesWithDataSets,
} from "./chart_common";
import {
  aggregateDataForLabels,
  filterEmptyDataPoints,
  getChartDatasetFormat,
  getChartDatasetValues,
  getChartLabelValues,
  getDefaultChartJsRuntime,
} from "./chart_ui_common";

export class PieChart extends AbstractChart {
  readonly dataSets: DataSet[];
  readonly labelRange?: Range | undefined;
  readonly background?: Color;
  readonly legendPosition: LegendPosition;
  readonly type = "pie";
  readonly aggregated?: boolean;
  readonly dataSetsHaveTitle: boolean;

  constructor(definition: PieChartDefinition, sheetId: UID, getters: CoreGetters) {
    super(definition, sheetId, getters);
    this.dataSets = createDataSets(
      getters,
      definition.dataSets,
      sheetId,
      definition.dataSetsHaveTitle
    );
    this.labelRange = createValidRange(getters, sheetId, definition.labelRange);
    this.background = definition.background;
    this.legendPosition = definition.legendPosition;
    this.aggregated = definition.aggregated;
    this.dataSetsHaveTitle = definition.dataSetsHaveTitle;
  }

  static transformDefinition(
    definition: PieChartDefinition,
    executed: AddColumnsRowsCommand | RemoveColumnsRowsCommand
  ): PieChartDefinition {
    return transformChartDefinitionWithDataSetsWithZone(definition, executed);
  }

  static validateChartDefinition(
    validator: Validator,
    definition: PieChartDefinition
  ): CommandResult | CommandResult[] {
    return validator.checkValidations(definition, checkDataset, checkLabelRange);
  }

  static getDefinitionFromContextCreation(context: ChartCreationContext): PieChartDefinition {
    return {
      background: context.background,
      dataSets: context.range ? context.range : [],
      dataSetsHaveTitle: false,
      legendPosition: "top",
      title: context.title || "",
      type: "pie",
      labelRange: context.auxiliaryRange || undefined,
      aggregated: false,
    };
  }

  getDefinition(): PieChartDefinition {
    return this.getDefinitionWithSpecificDataSets(this.dataSets, this.labelRange);
  }

  getContextCreation(): ChartCreationContext {
    return {
      background: this.background,
      title: this.title,
      range: this.dataSets.map((ds: DataSet) =>
        this.getters.getRangeString(ds.dataRange, this.sheetId)
      ),
      auxiliaryRange: this.labelRange
        ? this.getters.getRangeString(this.labelRange, this.sheetId)
        : undefined,
    };
  }

  private getDefinitionWithSpecificDataSets(
    dataSets: DataSet[],
    labelRange: Range | undefined,
    targetSheetId?: UID
  ): PieChartDefinition {
    return {
      type: "pie",
      dataSetsHaveTitle: dataSets.length ? Boolean(dataSets[0].labelCell) : false,
      background: this.background,
      dataSets: dataSets.map((ds: DataSet) =>
        this.getters.getRangeString(ds.dataRange, targetSheetId || this.sheetId)
      ),
      legendPosition: this.legendPosition,
      labelRange: labelRange
        ? this.getters.getRangeString(labelRange, targetSheetId || this.sheetId)
        : undefined,
      title: this.title,
      aggregated: this.aggregated,
    };
  }

  copyForSheetId(sheetId: UID): PieChart {
    const dataSets = copyDataSetsWithNewSheetId(this.sheetId, sheetId, this.dataSets);
    const labelRange = copyLabelRangeWithNewSheetId(this.sheetId, sheetId, this.labelRange);
    const definition = this.getDefinitionWithSpecificDataSets(dataSets, labelRange, sheetId);
    return new PieChart(definition, sheetId, this.getters);
  }

  copyInSheetId(sheetId: UID): PieChart {
    const definition = this.getDefinitionWithSpecificDataSets(
      this.dataSets,
      this.labelRange,
      sheetId
    );
    return new PieChart(definition, sheetId, this.getters);
  }

  getDefinitionForExcel(): ExcelChartDefinition | undefined {
    // Excel does not support aggregating labels
    if (this.aggregated) return undefined;
    const dataSets: ExcelChartDataset[] = this.dataSets
      .map((ds: DataSet) => toExcelDataset(this.getters, ds))
      .filter((ds) => ds.range !== "" && ds.range !== INCORRECT_RANGE_STRING);
    const labelRange = toExcelLabelRange(
      this.getters,
      this.labelRange,
      shouldRemoveFirstLabel(this.labelRange, this.dataSets[0], this.dataSetsHaveTitle)
    );
    return {
      ...this.getDefinition(),
      backgroundColor: toXlsxHexColor(this.background || BACKGROUND_CHART_COLOR),
      fontColor: toXlsxHexColor(chartFontColor(this.background)),
      verticalAxisPosition: "left", //TODO ExcelChartDefinition should be adapted, but can be done later
      dataSets,
      labelRange,
    };
  }

  updateRanges(applyChange: ApplyRangeChange): PieChart {
    const { dataSets, labelRange, isStale } = updateChartRangesWithDataSets(
      this.getters,
      applyChange,
      this.dataSets,
      this.labelRange
    );
    if (!isStale) {
      return this;
    }
    const definition = this.getDefinitionWithSpecificDataSets(dataSets, labelRange);
    return new PieChart(definition, this.sheetId, this.getters);
  }
}

function getPieConfiguration(
  chart: PieChart,
  labels: string[],
  localeFormat: LocaleFormat
): ChartConfiguration {
  const fontColor = chartFontColor(chart.background);
  const config = getDefaultChartJsRuntime(chart, labels, fontColor, localeFormat);
  const legend: DeepPartial<LegendOptions<"pie">> = {
    labels: { color: fontColor },
  };
  if ((!chart.labelRange && chart.dataSets.length === 1) || chart.legendPosition === "none") {
    legend.display = false;
  } else {
    legend.position = chart.legendPosition;
  }
  Object.assign(config.options.plugins!.legend || {}, legend);
  config.options.layout = {
    padding: { left: 20, right: 20, top: chart.title ? 10 : 25, bottom: 10 },
  };
  config.options.plugins!.tooltip!.callbacks!.title = function (tooltipItems) {
    return tooltipItems[0].dataset.label;
  };
  config.options.plugins!.tooltip!.callbacks!.label = function (tooltipItem) {
    const { format, locale } = localeFormat;
    const data = tooltipItem.dataset.data;
    const dataIndex = tooltipItem.dataIndex;
    const percentage = calculatePercentage(data, dataIndex);

    const xLabel = tooltipItem.label || tooltipItem.dataset.label;
    const yLabel = tooltipItem.parsed.y ?? tooltipItem.parsed;
    const toolTipFormat = !format && Math.abs(yLabel) >= 1000 ? "#,##" : format;
    const yLabelStr = formatValue(yLabel, { format: toolTipFormat, locale });

    return xLabel ? `${xLabel}: ${yLabelStr} (${percentage}%)` : `${yLabelStr} (${percentage}%)`;
  };
  return config;
}

function getPieColors(colors: ChartColors, dataSetsValues: DatasetValues[]): Color[] {
  const pieColors: Color[] = [];
  const maxLength = largeMax(dataSetsValues.map((ds) => ds.data.length));
  for (let i = 0; i <= maxLength; i++) {
    pieColors.push(colors.next());
  }

  return pieColors;
}

function calculatePercentage(
  dataset: (number | [number, number] | Point | BubbleDataPoint | null)[],
  dataIndex: number
): string {
  const numericData: number[] = dataset.filter((value) => typeof value === "number") as number[];
  const total = numericData.reduce((sum, value) => sum + value, 0);

  if (!total) {
    return "";
  }
  const percentage = ((dataset[dataIndex] as number) / total) * 100;

  return percentage.toFixed(2);
}

export function createPieChartRuntime(chart: PieChart, getters: Getters): PieChartRuntime {
  const labelValues = getChartLabelValues(getters, chart.dataSets, chart.labelRange);
  let labels = labelValues.formattedValues;
  let dataSetsValues = getChartDatasetValues(getters, chart.dataSets);
  if (
    chart.dataSetsHaveTitle &&
    dataSetsValues[0] &&
    labels.length > dataSetsValues[0].data.length
  ) {
    labels.shift();
  }

  ({ labels, dataSetsValues } = filterEmptyDataPoints(labels, dataSetsValues));

  if (chart.aggregated) {
    ({ labels, dataSetsValues } = aggregateDataForLabels(labels, dataSetsValues));
  }
  const dataSetFormat = getChartDatasetFormat(getters, chart.dataSets);
  const locale = getters.getLocale();
  const config = getPieConfiguration(chart, labels, { format: dataSetFormat, locale });
  const colors = new ChartColors();
  for (let { label, data } of dataSetsValues) {
    const backgroundColor = getPieColors(colors, dataSetsValues);
    const dataset: ChartDataset = {
      label,
      data,
      borderColor: "#FFFFFF",
      backgroundColor,
    };
    config.data!.datasets!.push(dataset);
  }

  return { chartJsConfig: config, background: chart.background || BACKGROUND_CHART_COLOR };
}
