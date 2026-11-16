/** Require the outward-facing lens; never silently select a selfie camera. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNSUPPORTED');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { exact: 'environment' }, width: { ideal: 2000 }, height: { ideal: 1500 } },
  });
  if (stream.getVideoTracks().some(track => track.getSettings().facingMode === 'user')) {
    stream.getTracks().forEach(track => track.stop());
    throw new Error('REAR_CAMERA_UNAVAILABLE');
  }
  return stream;
}
