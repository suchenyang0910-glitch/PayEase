/**
 * A visible preview badge is a safety control for deliberately limited demo
 * builds. Production must opt out by default: an omitted build variable is
 * never treated as a preview environment.
 */
export function isControlledPreviewBuild(value: string | undefined): boolean {
  return value === "controlled-preview";
}
