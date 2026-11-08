const GENERATED_SCAN_PREFIX = 'design/reports/scan/';

export function generatedScanPaths(paths) {
  return [...new Set(paths.map(path => String(path).replaceAll('\\', '/')))]
    .filter(path => path.startsWith(GENERATED_SCAN_PREFIX));
}

export function assertNoGeneratedScanArtifacts(paths) {
  const unsafe = generatedScanPaths(paths);
  if (unsafe.length) {
    const error = new Error(`${unsafe.length} generated scan artifact path(s) are not allowed in public changes`);
    error.count = unsafe.length;
    throw error;
  }
}
