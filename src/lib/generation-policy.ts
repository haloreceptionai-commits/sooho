/** Only confirmed rejections may be retried as a fresh paid request. */
export function safePaidRetry(message: string) {
  return /^\[429\]/.test(message);
}

export function generationPath(userId: string, videoId: string, jobId: string, key: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(videoId) || !/^[a-z0-9:_-]{1,110}(\.(wav|jpg|mp4))?$/.test(key)) throw Error('Invalid generation asset');
  return `${userId}/${videoId}/generation/${jobId}/${key.replaceAll(':', '-')}`;
}