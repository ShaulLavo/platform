// swift-tools-version: 6.2
// Requires full Xcode (26+), not Command Line Tools alone — see README.
import PackageDescription

let package = Package(
  name: "mac",
  platforms: [.macOS(.v26)],
  targets: [
    .target(name: "EditorCore"),
    .executableTarget(name: "EditorBench", dependencies: ["EditorCore"]),
    .executableTarget(
      name: "MacApp",
      dependencies: ["EditorCore"],
      swiftSettings: [
        // Swift 6.2 approachable concurrency: the app target is MainActor by
        // default; EditorCore stays nonisolated — a text buffer must not be
        // pinned to the main thread.
        .defaultIsolation(MainActor.self),
        .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
        .enableUpcomingFeature("InferIsolatedConformances"),
      ]
    ),
    .testTarget(name: "EditorCoreTests", dependencies: ["EditorCore"]),
  ]
)
