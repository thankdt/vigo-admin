---
name: Flutter CI/CD
description: Continuous Integration and Deployment standards for Flutter apps.
metadata:
  labels: [cicd, github-actions, automation, codemagic, fastlane]
  triggers:
    files:
      [
        '.github/workflows/**.yml',
        'fastlane/**',
        'android/fastlane/**',
        'ios/fastlane/**',
      ]
    keywords: [ci, cd, pipeline, build, deploy, release, action, workflow]
---

# CI/CD Standards

## **Priority: P1 (HIGH)**

Automates code quality checks, testing, and deployment to prevent regressions and accelerate delivery.

## Core Pipeline Steps

1. **Environment Setup**: Use stable Flutter channel. Cache dependencies (pub, gradle, cocoapods).
2. **Static Analysis**: Enforce `flutter analyze` and `dart format`. Fail on any warning in strict mode.
3. **Testing**: Run unit, widget, and integration tests. Upload coverage reports (e.g., Codecov).
4. **Build**:
   - **Android**: Build App Bundle (`.aab`) for Play Store.
   - **iOS**: Sign and build `.ipa` (requires macOS runner).
5. **Deployment** (CD): Automated upload to TestFlight/Play Console using standard tools (Fastlane, Codemagic).

## Best Practices

- **Timeout Limits**: Always set `timeout-minutes` (e.g., 30m) to save costs on hung jobs.
- **Fail Fast**: Run Analyze/Format _before_ Tests/Builds.
- **Secrets**: Never commit keys. Use GitHub Secrets or secure vaults for `keystore.jks` and `.p8` certs.
- **Versioning**: Automate version bumping based on git tags or semantic version scripts.

## Reference

- [**GitHub Actions Template**](references/github-actions.md) - Standard workflow file.
- [**Advanced Large-Scale Workflow**](references/advanced-workflow.md) - Parallel jobs, Caching, Strict Mode.
- [**Fastlane Standards**](references/fastlane.md) - Automated Signing & Deployment.

## Vigo project specifics (verified against the repos)

Two apps share these conventions: **vigo** (customer, `1.4.15+27`) and **vigo-driver** (driver, `1.4.18+32`).

- **Flavors**: `dev` and `prod`, entrypoints `lib/main_dev.dart` / `lib/main_prod.dart`. Android uses an `environment` flavor dimension; iOS has a single `Runner` scheme.
- **Env config**: loaded at runtime via `flutter_dotenv` from `.env.dev` / `.env.prod` (NOT `--dart-define`). For a prod release confirm `.env.prod` points at production endpoints.
- **Release builds** (pass flavor + prod entrypoint):
  - Android: `flutter build appbundle --release --flavor prod -t lib/main_prod.dart`
  - iOS: `flutter build ipa --release --flavor prod -t lib/main_prod.dart`
- **Signing**: Android via `android/key.properties` (gitignored, wired into `android/app/build.gradle` `signingConfigs.release`). iOS via Xcode-managed provisioning.
- **CI/CD reality**: there is currently **no** GitHub Actions / Fastlane / Codemagic pipeline — releases are built and uploaded manually. The standards above are the target if/when CI is added.
- **Checks before done**: `flutter analyze` (config: `analysis_options.yaml` → `flutter_lints`) clean and `flutter test` green. Bump `version:` in `pubspec.yaml`; the `+build` integer must increase on every store upload.

## Related Topics

flutter-testing | dart-tooling
