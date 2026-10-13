import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { validateOpenOutlineKeepouts } from "../scripts/validate-open-outline-keepouts.mjs"

const sample = JSON.parse(readFileSync(new URL("../samples/sample024.json", import.meta.url)))
const circuitJson = JSON.parse(readFileSync(new URL(`../${sample.sourceCircuitJson}`, import.meta.url)))
const firstSegmentId = "pcb_keepout_altium_arc_4641_segment_0"
const firstJoinId = "pcb_keepout_altium_arc_4641_join_0"

test("the five PMP22650 open arcs match the source geometry", () => {
  expect(validateOpenOutlineKeepouts(sample, circuitJson)).toBe(5)
})

test.each([
  ["all arc obstacles removed", (obstacles) => obstacles.filter((o) => !/^pcb_keepout_altium_arc_464[1-5]_/.test(o.obstacleId ?? ""))],
  ["one segment removed", (obstacles) => obstacles.filter((o) => o.obstacleId !== firstSegmentId)],
  ["one join removed", (obstacles) => obstacles.filter((o) => o.obstacleId !== firstJoinId)],
  ["rotation removed", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, ccwRotationDegrees: undefined } : o)],
  ["wrong layer", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, layers: ["top"] } : o)],
  ["wrong stroke width", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, height: o.height / 2 } : o)],
  ["wrong position", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, center: { x: 0, y: 0 } } : o)],
  ["electrical connectivity added", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, connectedTo: ["source_net_0"] } : o)],
  ["duplicate segment", (obstacles) => [...obstacles, obstacles.find((o) => o.obstacleId === firstSegmentId)]],
  ["unexpected closing segment", (obstacles) => [...obstacles, { ...obstacles.find((o) => o.obstacleId === firstSegmentId), obstacleId: "pcb_keepout_altium_arc_4641_segment_47" }]],
])("rejects %s", (_, mutate) => {
  expect(() => validateOpenOutlineKeepouts({ ...sample, obstacles: mutate(sample.obstacles) }, circuitJson)).toThrow(/open keepout/)
})
