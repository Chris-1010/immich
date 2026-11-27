import { isCastCopyRequired } from 'src/utils/media';
import { VideoStreamInfo } from 'src/types';

const stream = (overrides: Partial<VideoStreamInfo> = {}): VideoStreamInfo => ({
  index: 0,
  width: 1920,
  height: 1080,
  rotation: 0,
  codecName: 'h264',
  frameCount: 100,
  isHDR: false,
  bitrate: 0,
  pixelFormat: 'yuv420p',
  ...overrides,
});

describe('isCastCopyRequired', () => {
  it('should not require a copy for 1080p landscape h264 yuv420p', () => {
    expect(isCastCopyRequired(stream())).toBe(false);
  });

  it('should not require a copy for smaller compliant videos', () => {
    expect(isCastCopyRequired(stream({ width: 1280, height: 720 }))).toBe(false);
    expect(isCastCopyRequired(stream({ width: 608, height: 1080 }))).toBe(false);
  });

  it('should treat a full rotation as unrotated', () => {
    expect(isCastCopyRequired(stream({ rotation: 360 }))).toBe(false);
  });

  it.each([
    ['portrait 1080x1920', { width: 1080, height: 1920 }],
    ['portrait 1080x1440', { width: 1080, height: 1440 }],
    ['cropped 864x1170', { width: 864, height: 1170 }],
    ['wider than 1920', { width: 2560, height: 1080 }],
    ['4k', { width: 3840, height: 2160 }],
    ['rotated 90', { rotation: 90 }],
    ['rotated -90', { rotation: -90 }],
    ['rotated 180', { rotation: 180 }],
    ['hevc', { codecName: 'hevc' }],
    ['unknown codec', { codecName: undefined }],
    ['10-bit', { pixelFormat: 'yuv420p10le' }],
    ['4:2:2', { pixelFormat: 'yuv422p' }],
  ])('should require a copy for %s', (_, overrides) => {
    expect(isCastCopyRequired(stream(overrides))).toBe(true);
  });
});
