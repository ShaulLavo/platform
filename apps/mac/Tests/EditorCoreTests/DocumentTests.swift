import Testing

@testable import EditorCore

@Test func lineStartsCountLines() {
  let document = Document(text: "one\ntwo\nthree")
  #expect(document.lineCount == 3)
}

@Test func emptyDocumentHasOneLine() {
  let document = Document(text: "")
  #expect(document.lineCount == 1)
}

@Test func trailingNewlineOpensALine() {
  let document = Document(text: "one\n")
  #expect(document.lineCount == 2)
}
