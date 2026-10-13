const nearlyEqual = (first, second) =>
  Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) < 0.000001

// Open paths use native segment rectangles and square joins in board-world mm.
// Check their geometry against the source, so missing rotation or a filled-in
// arc cannot pass simply because the total obstacle count looks plausible.
export const validateOpenOutlineKeepouts = (sample, circuitJson) => {
  const obstaclesById = new Map()
  for (const obstacle of sample.obstacles) {
    if (!obstacle.obstacleId) continue
    const matches = obstaclesById.get(obstacle.obstacleId) ?? []
    matches.push(obstacle)
    obstaclesById.set(obstacle.obstacleId, matches)
  }

  let validatedKeepoutCount = 0
  for (const keepout of circuitJson) {
    if (keepout.type !== "pcb_keepout" || keepout.shape !== "outline") continue
    const { outline, stroke_width } = keepout
    if (outline.length < 2) continue
    if (outline[0].x === outline.at(-1).x && outline[0].y === outline.at(-1).y) continue

    const assertObstacle = (id, center, width, height, rotation = 0) => {
      const matches = obstaclesById.get(id) ?? []
      const obstacle = matches[0]
      const rotationDifference = obstacle
        ? (((obstacle.ccwRotationDegrees ?? 0) - rotation) % 360 + 540) % 360 - 180
        : NaN
      if (
        matches.length !== 1 ||
        obstacle.type !== "rect" ||
        !nearlyEqual(obstacle.center.x, center.x) ||
        !nearlyEqual(obstacle.center.y, center.y) ||
        !nearlyEqual(obstacle.width, width) ||
        !nearlyEqual(obstacle.height, height) ||
        !nearlyEqual(rotationDifference, 0) ||
        JSON.stringify([...obstacle.layers].sort()) !== JSON.stringify([...keepout.layers].sort()) ||
        obstacle.connectedTo.length !== 0
      ) {
        throw new Error(`${sample.id} open keepout obstacle ${id} is missing or differs from its source geometry`)
      }
    }

    const expectedIds = new Set()
    for (let index = 0; index < outline.length - 1; index++) {
      const start = outline[index]
      const end = outline[index + 1]
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.hypot(dx, dy)
      if (length === 0) continue
      const id = `${keepout.pcb_keepout_id}_segment_${index}`
      expectedIds.add(id)
      assertObstacle(id, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, length, stroke_width, Math.atan2(dy, dx) * 180 / Math.PI)
    }
    for (const [index, point] of outline.entries()) {
      const id = `${keepout.pcb_keepout_id}_join_${index}`
      expectedIds.add(id)
      assertObstacle(id, point, stroke_width, stroke_width)
    }
    for (const obstacle of sample.obstacles) {
      const id = obstacle.obstacleId
      if ((id === keepout.pcb_keepout_id || id?.startsWith(`${keepout.pcb_keepout_id}_`)) && !expectedIds.has(id)) {
        throw new Error(`${sample.id} open keepout ${keepout.pcb_keepout_id} has an unexpected obstacle ${id}`)
      }
    }
    validatedKeepoutCount += 1
  }
  return validatedKeepoutCount
}
