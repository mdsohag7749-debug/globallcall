/**
 * In-browser Call Recorder utility using MediaRecorder API
 */
export class CallRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime: number = 0;
  private timerInterval: number | null = null;
  private onTimeUpdate?: (seconds: number) => void;

  constructor(onTimeUpdate?: (seconds: number) => void) {
    this.onTimeUpdate = onTimeUpdate;
  }

  public isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  public start(stream: MediaStream): boolean {
    try {
      if (this.isRecording()) return false;

      this.recordedChunks = [];
      const options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp8,opus' };
      
      let recorder: MediaRecorder;
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        recorder = new MediaRecorder(stream, options);
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
      } else {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        this.saveToFile();
      };

      recorder.start(1000); // 1 second timeslice
      this.mediaRecorder = recorder;
      this.startTime = Date.now();

      if (this.onTimeUpdate) {
        this.timerInterval = window.setInterval(() => {
          const elapsedSecs = Math.floor((Date.now() - this.startTime) / 1000);
          this.onTimeUpdate?.(elapsedSecs);
        }, 1000);
      }

      return true;
    } catch (err) {
      console.error('Failed to start call recording:', err);
      return false;
    }
  }

  public stop(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }

  private saveToFile(): void {
    if (this.recordedChunks.length === 0) return;

    const mime = this.recordedChunks[0].type || 'video/webm';
    const blob = new Blob(this.recordedChunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `GlobalCall-recording-${timestamp}.webm`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 1000);
  }
}
