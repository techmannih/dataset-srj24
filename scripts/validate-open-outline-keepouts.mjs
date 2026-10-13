const nearlyEqual = (first, second) =>
  Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) < 0.000001

// The checked-in dataset uses two axis-aligned slices per segment. These
// equations describe that legacy representation, including its 10% overlap.
const getLegacySegmentRects = (center, width, height, rotation) => {
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const angle = (rotation + 360) % 360
  const sliceAlongWidth = height <= width
    ? (angle >= 45 && angle < 135) || (angle >= 225 && angle < 315)
    : (angle >= 135 && angle < 225) || angle >= 315 || angle < 45

  return [-0.25, 0.25].map((offset) => sliceAlongWidth ? {
    center: { x: center.x - offset * width * cos, y: center.y - offset * width * sin },
    width: width / 2 * 1.1,
    height: Math.abs(height * cos) + Math.abs(width / 2 * sin),
  } : {
    center: { x: center.x - offset * height * sin, y: center.y + offset * height * cos },
    width: Math.abs(width * cos) + Math.abs(height / 2 * sin),
    height: height / 2 * 1.1,
  })
}

const getLegacyJoinRects = (point, strokeWidth) =>
  [-0.375, -0.125, 0.125, 0.375].map((offset) => ({
    center: { x: point.x, y: point.y + offset * strokeWidth },
    width: 2 * Math.sqrt((strokeWidth / 2) ** 2 - (offset * strokeWidth) ** 2),
    height: strokeWidth / 4,
  }))

// Check both the existing sliced rectangles and native rotated rectangles
// against source geometry in board-world mm. This does not regenerate data
// or require a particular core preview dependency.
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

    const keepoutObstacles = sample.obstacles.filter((obstacle) =>
      obstacle.obstacleId === keepout.pcb_keepout_id ||
      obstacle.obstacleId?.startsWith(`${keepout.pcb_keepout_id}_`),
    )
    const usesLegacyRects = keepoutObstacles.some((obstacle) =>
      /_(segment|join)_\d+_rect_\d+$/.test(obstacle.obstacleId),
    )

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
    const assertRects = (id, rects) => {
      for (const [index, rect] of rects.entries()) {
        const rectId = usesLegacyRects ? `${id}_rect_${index}` : id
        expectedIds.add(rectId)
        assertObstacle(rectId, rect.center, rect.width, rect.height, rect.rotation)
      }
    }
    for (let index = 0; index < outline.length - 1; index++) {
      const start = outline[index]
      const end = outline[index + 1]
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.hypot(dx, dy)
      if (length === 0) continue
      const id = `${keepout.pcb_keepout_id}_segment_${index}`
      const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
      const rotation = Math.atan2(dy, dx) * 180 / Math.PI
      assertRects(id, usesLegacyRects
        ? getLegacySegmentRects(center, length, stroke_width, rotation)
        : [{ center, width: length, height: stroke_width, rotation }])
    }
    for (const [index, point] of outline.entries()) {
      const id = `${keepout.pcb_keepout_id}_join_${index}`
      assertRects(id, usesLegacyRects
        ? getLegacyJoinRects(point, stroke_width)
        : [{ center: point, width: stroke_width, height: stroke_width }])
    }
    for (const obstacle of keepoutObstacles) {
      const id = obstacle.obstacleId
      if (!expectedIds.has(id)) {
        throw new Error(`${sample.id} open keepout ${keepout.pcb_keepout_id} has an unexpected obstacle ${id}`)
      }
    }
    validatedKeepoutCount += 1
  }
  return validatedKeepoutCount
}
