import type { PlaybackBackend, PlaybackEventSink } from "../PlaybackBackend";

/**
 * The media-element backend. Owns the hidden `<audio>` element and its
 * `MediaElementAudioSourceNode` so its output flows through the shared WebAudio
 * graph. Real element events are raised through the sink (which `Player` gates
 * to the active backend).
 */
export class MediaPlaybackBackend implements PlaybackBackend {
  readonly sourceNode: MediaElementAudioSourceNode;

  private readonly element: HTMLAudioElement;
  private readonly sink: PlaybackEventSink;
  private awaitingInitialReady = false;

  constructor(ctx: AudioContext, sink: PlaybackEventSink) {
    this.sink = sink;

    const element = new Audio();
    element.crossOrigin = "anonymous";
    element.volume = 1;
    this.element = element;
    this.sourceNode = ctx.createMediaElementSource(element);

    const dataless: Array<Parameters<PlaybackEventSink>[0]> = [
      "play",
      "playing",
      "pause",
      "ended",
      "stalled",
      "seeking",
      "seeked",
      "timeupdate",
      "durationchange",
      "ratechange",
    ];
    for (const name of dataless) {
      element.addEventListener(name, () => this.sink(name));
    }
    element.addEventListener("error", (event) => this.sink("error", event));
    // Seeking and buffering can raise canplay again. Legacy onLoad handlers
    // restore the saved position, so forwarding every canplay creates a seek loop.
    element.addEventListener("canplay", () => {
      if (!this.awaitingInitialReady) return;
      this.awaitingInitialReady = false;
      this.sink("load");
    });

    LOGGER.debug("Media playback backend initialized");
  }

  load(): Promise<void> {
    LOGGER.debug("Media playback source reset for load");
    this.awaitingInitialReady = true;
    this.element.src = `audio://audio?t=${Date.now()}`;
    this.element.load();
    return Promise.resolve();
  }

  async play(): Promise<void> {
    await this.element.play();
  }

  pause(): void {
    this.element.pause();
  }

  stop(): void {
    this.awaitingInitialReady = false;
    this.element.pause();
    this.element.currentTime = 0;
    this.element.src = "";
  }

  seek(seconds: number): void {
    this.element.currentTime = seconds;
  }

  get currentTime(): number {
    return this.element.currentTime;
  }

  get duration(): number {
    return this.element.duration;
  }

  get paused(): boolean {
    return this.element.paused;
  }

  get ended(): boolean {
    return this.element.ended;
  }

  get playbackRate(): number {
    return this.element.playbackRate;
  }

  setPlaybackRate(rate: number): void {
    this.element.playbackRate = rate;
  }

  async dispose(): Promise<void> {
    this.awaitingInitialReady = false;
    // Drop any leftover source so a stale audio://audio request can't spam.
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
  }
}
