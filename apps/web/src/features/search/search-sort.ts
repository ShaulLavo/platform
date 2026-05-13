const fileNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function compareSearchPaths(left: string, right: string) {
  const leftParts = left.split("/")
  const rightParts = right.split("/")

  for (let index = 0; ; index += 1) {
    const leftPart = leftParts[index] ?? ""
    const rightPart = rightParts[index] ?? ""
    const leftIsFileName = index === leftParts.length - 1
    const rightIsFileName = index === rightParts.length - 1

    if (leftIsFileName && rightIsFileName) {
      return compareSearchFileNames(leftPart, rightPart)
    }
    if (leftIsFileName) return -1
    if (rightIsFileName) return 1

    const result = comparePathComponents(leftPart, rightPart)
    if (result !== 0) return result
  }
}

export function compareSearchFileNames(left: string, right: string) {
  const result = fileNameCollator.compare(left, right)
  if (result !== 0) return result
  if (left === right) return 0

  return left < right ? -1 : 1
}

function comparePathComponents(left: string, right: string) {
  const normalizedLeft = left.toLocaleLowerCase()
  const normalizedRight = right.toLocaleLowerCase()
  if (normalizedLeft === normalizedRight) return 0

  return normalizedLeft < normalizedRight ? -1 : 1
}
