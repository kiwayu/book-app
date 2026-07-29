/**
 * Google Play submission guardrails. These assert the app.json fields Play
 * rejects a build/upload without: a valid applicationId, an integer
 * versionCode, a version that matches package.json, portrait lock, and an
 * Android adaptive icon. Failing here means the AAB won't pass Play review.
 */
import appJson from "../app.json";
import pkg from "../package.json";

const { expo } = appJson;

describe("Google Play readiness — app.json", () => {
  it("declares a valid reverse-DNS applicationId (android.package)", () => {
    // Play requires a unique, permanent package id like com.company.app
    expect(expo.android.package).toMatch(
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/
    );
  });

  it("declares an integer android.versionCode >= 1", () => {
    expect(Number.isInteger(expo.android.versionCode)).toBe(true);
    expect(expo.android.versionCode).toBeGreaterThanOrEqual(1);
  });

  it("keeps app.json version in sync with package.json", () => {
    expect(expo.version).toBe(pkg.version);
  });

  it("uses a semver marketing version", () => {
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("locks orientation to portrait", () => {
    expect(expo.orientation).toBe("portrait");
  });

  it("ships an Android adaptive icon foreground", () => {
    expect(expo.android.adaptiveIcon?.foregroundImage).toBeTruthy();
  });
});
