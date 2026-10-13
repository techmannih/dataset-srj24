import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { validateOpenOutlineKeepouts } from "../scripts/validate-open-outline-keepouts.mjs"

const sample = JSON.parse(readFileSync(new URL("../samples/sample024.json", import.meta.url)))
const circuitJson = JSON.parse(readFileSync(new URL(`../${sample.sourceCircuitJson}`, import.meta.url)))
const firstSegmentId = "pcb_keepout_altium_arc_4641_segment_0_rect_0"
const firstJoinId = "pcb_keepout_altium_arc_4641_join_0_rect_0"

test("the five PMP22650 open arcs match the source geometry", () => {
  expect(validateOpenOutlineKeepouts(sample, circuitJson)).toBe(5)
})

test.each([
  ["all arc obstacles removed", (obstacles) => obstacles.filter((o) => !/^pcb_keepout_altium_arc_464[1-5]_/.test(o.obstacleId ?? ""))],
  ["one segment removed", (obstacles) => obstacles.filter((o) => o.obstacleId !== firstSegmentId)],
  ["one join removed", (obstacles) => obstacles.filter((o) => o.obstacleId !== firstJoinId)],
  ["wrong rotation", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, ccwRotationDegrees: 45 } : o)],
  ["wrong layer", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, layers: ["top"] } : o)],
  ["wrong stroke width", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, height: o.height / 2 } : o)],
  ["wrong position", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, center: { x: 0, y: 0 } } : o)],
  ["electrical connectivity added", (obstacles) => obstacles.map((o) => o.obstacleId === firstSegmentId ? { ...o, connectedTo: ["source_net_0"] } : o)],
  ["duplicate segment", (obstacles) => [...obstacles, obstacles.find((o) => o.obstacleId === firstSegmentId)]],
  ["unexpected slice", (obstacles) => [...obstacles, { ...obstacles.find((o) => o.obstacleId === firstSegmentId), obstacleId: "pcb_keepout_altium_arc_4641_segment_0_rect_2" }]],
  ["unexpected closing segment", (obstacles) => [...obstacles, { ...obstacles.find((o) => o.obstacleId === firstSegmentId), obstacleId: "pcb_keepout_altium_arc_4641_segment_47" }]],
])("rejects %s", (_, mutate) => {
  expect(() => validateOpenOutlineKeepouts({ ...sample, obstacles: mutate(sample.obstacles) }, circuitJson)).toThrow(/open keepout/)
})

// An independent, small native-rectangle fixture keeps validation compatible
// with a future regeneration without taking a dependency on another PR.
const nativeKeepout = {
  type: "pcb_keepout",
  pcb_keepout_id: "pcb_keepout_open_path",
  shape: "outline",
  outline: [{ x: 0, y: 0 }, { x: 3, y: 4 }],
  stroke_width: 0.2,
  layers: ["bottom", "top"],
}
const nativeSample = {
  id: "native-open-path",
  obstacles: [
    { obstacleId: "pcb_keepout_open_path_segment_0", center: { x: 1.5, y: 2 }, width: 5, height: 0.2, ccwRotationDegrees: 53.13010235415598 },
    { obstacleId: "pcb_keepout_open_path_join_0", center: { x: 0, y: 0 }, width: 0.2, height: 0.2 },
    { obstacleId: "pcb_keepout_open_path_join_1", center: { x: 3, y: 4 }, width: 0.2, height: 0.2 },
  ].map((obstacle) => ({ ...obstacle, type: "rect", layers: ["top", "bottom"], connectedTo: [] })),
}

test("accepts native segment rectangles and square joins", () => {
  expect(validateOpenOutlineKeepouts(nativeSample, [nativeKeepout])).toBe(1)
})

test.each([
  ["missing rotation", (obstacles) => obstacles.map((o) => ({ ...o, ccwRotationDegrees: undefined }))],
  ["missing segment", (obstacles) => obstacles.slice(1)],
  ["missing endpoint join", (obstacles) => obstacles.slice(0, -1)],
  ["all obstacles removed", () => []],
  ["closing segment", (obstacles) => [...obstacles, { ...obstacles[0], obstacleId: "pcb_keepout_open_path_segment_1" }]],
  ["mixed legacy and native rectangles", (obstacles) => [...obstacles, { ...obstacles[0], obstacleId: "pcb_keepout_open_path_segment_0_rect_0" }]],
])("rejects native %s", (_, mutate) => {
  expect(() => validateOpenOutlineKeepouts({ ...nativeSample, obstacles: mutate(nativeSample.obstacles) }, [nativeKeepout])).toThrow(/open keepout/)
})
