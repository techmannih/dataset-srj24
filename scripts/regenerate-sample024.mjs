import { readFileSync, writeFileSync } from "node:fs"
import { getSimpleRouteJsonFromCircuitJson } from "@tscircuit/core"
import { convertSrjToGraphicsObject } from "@tscircuit/capacity-autorouter"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { stackSvgsHorizontally } from "stack-svgs"
import { validateOpenOutlineKeepouts } from "./validate-open-outline-keepouts.mjs"

// Regenerate routing data from the checked-in Circuit JSON. The original
// Altium and Circuit JSON comparison panels remain byte-for-byte unchanged;
// no TI archive download or source conversion is needed for this core update.
const samplePath = "samples/sample024.json"
const previous = JSON.parse(readFileSync(samplePath, "utf8"))
const circuitJson = JSON.parse(readFileSync(previous.sourceCircuitJson, "utf8"))
const { simpleRouteJson } = getSimpleRouteJsonFromCircuitJson({
  circuitJson,
  ignoreExistingTopLevelPcbRouteState: true,
})
const sample = {
  ...simpleRouteJson,
  id: previous.id,
  sourceCircuitJson: previous.sourceCircuitJson,
  sourceName: previous.sourceName,
  sourceUrl: previous.sourceUrl,
  sourceRepository: previous.sourceRepository,
  sourceLicense: previous.sourceLicense,
  sourceBoardFormat: previous.sourceBoardFormat,
  sourcePcbDocSha256: previous.sourcePcbDocSha256,
  snapshotComparison: previous.snapshotComparison,
}
const keepoutCount = validateOpenOutlineKeepouts(sample, circuitJson)

const srjSvg = getSvgFromGraphicsObject(convertSrjToGraphicsObject(sample), {
  backgroundColor: "#11161b",
  svgWidth: 800,
  svgHeight: 600,
  hideInlineLabels: true,
})
// Match generate-ti-altium-samples.mjs's three 800px panels and 24px gaps.
const blankPanel = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>'
const comparison = stackSvgsHorizontally([blankPanel, blankPanel, srjSvg], {
  gap: 24,
  normalizeSize: true,
  targetSize: 800,
})
const panelMarker = '<g transform="translate(1648, 0)'
const labelsMarker = '  <g font-family="Inter,Arial,sans-serif"'
const existingSvg = readFileSync(previous.snapshotComparison, "utf8")
const panelStart = existingSvg.indexOf(panelMarker)
const labelsStart = existingSvg.lastIndexOf(labelsMarker)
const generatedPanelStart = comparison.indexOf(panelMarker)
const generatedPanelEnd = comparison.lastIndexOf("</svg>")
if (
  panelStart < 0 || labelsStart <= panelStart ||
  generatedPanelStart < 0 || generatedPanelEnd <= generatedPanelStart
) {
  throw new Error("Sample024 comparison does not have the expected three-panel layout")
}
const regeneratedSvg = existingSvg.slice(0, panelStart) +
  comparison.slice(generatedPanelStart, generatedPanelEnd)
    .split("\n").map((line) => line.trimEnd()).join("\n").trimEnd() + "\n" +
  existingSvg.slice(labelsStart)

writeFileSync(samplePath, `${JSON.stringify(sample, null, 2)}\n`)
writeFileSync(previous.snapshotComparison, regeneratedSvg)
console.log(
  `${sample.id}: ${sample.obstacles.length} obstacles, ${sample.connections.length} connections, ${keepoutCount} validated open keepouts`,
)
