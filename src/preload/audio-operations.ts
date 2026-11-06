/** Legacy callbacks must echo the operation token, not just the track ID. */
export class AudioOperations {
  private transport: { track: string; operation: string } | null = null;
  private seek: { track: string; operation: string } | null = null;
  reset() {
    this.transport = this.seek = null;
  }
  setTransport(track: string, operation = "") {
    this.transport = { track, operation };
  }
  transportId(track: string) {
    return this.transport?.track === track ? this.transport.operation : "";
  }
  setSeek(track: string, operation: string) {
    this.seek = { track, operation };
  }
  takeSeekId(track: string) {
    if (this.seek?.track !== track) return "";
    const operation = this.seek.operation;
    this.seek = null;
    return operation;
  }
}
export const audioOperations = new AudioOperations();
