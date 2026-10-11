// Tách ra để test mock được — jsdom không điều hướng khi gán location.href.
export function redirectTo(path: string): void {
  window.location.href = path;
}
