import { defaults } from 'src/config';
import { ToneMapping, VideoCodec } from 'src/enum';
import { VideoStreamInfo } from 'src/types';
import { getCastCommand, getCastSize, isCastCopyRequired } from 'src/utils/media';

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

describe('getCastSize', () => {
  it.each([
    ['keeps compliant landscape', { width: 1920, height: 1080 }, { width: 1920, height: 1080 }],
    ['never upscales', { width: 640, height: 480 }, { width: 640, height: 480 }],
    ['rounds odd dimensions down to even', { width: 641, height: 481 }, { width: 640, height: 480 }],
    ['fits 4k landscape', { width: 3840, height: 2160 }, { width: 1920, height: 1080 }],
    ['fits ultrawide by width', { width: 3840, height: 1080 }, { width: 1920, height: 540 }],
    ['fits portrait by height', { width: 1080, height: 1920 }, { width: 606, height: 1080 }],
    ['fits cropped portrait', { width: 864, height: 1170 }, { width: 796, height: 1080 }],
    ['swaps for 90 rotation', { width: 1920, height: 1080, rotation: 90 }, { width: 606, height: 1080 }],
    ['swaps for -90 rotation', { width: 1920, height: 1080, rotation: -90 }, { width: 606, height: 1080 }],
    ['keeps size for 180 rotation', { width: 1920, height: 1080, rotation: 180 }, { width: 1920, height: 1080 }],
  ])('%s', (_, overrides, expected) => {
    expect(getCastSize(stream(overrides))).toEqual(expected);
  });
});

describe('getCastCommand', () => {
  const config = defaults.ffmpeg;

  it('should build a software h264 high/yuv420p mp4 command', () => {
    const command = getCastCommand(config, stream({ width: 1080, height: 1920, codecName: 'hevc' }), {
      index: 1,
      codecName: 'mp3',
      bitrate: 0,
    });

    expect(command.inputOptions).toEqual([]);
    expect(command.twoPass).toBe(false);
    expect(command.outputOptions).toEqual(
      expect.arrayContaining([
        '-map 0:0',
        '-map 0:1',
        '-map_metadata -1',
        '-c:v libx264',
        '-profile:v high',
        '-level:v 4.1',
        `-preset ${config.preset}`,
        `-crf ${config.crf}`,
        '-vf scale=606:1080,format=yuv420p',
        '-metadata:s:v:0 rotate=0',
        '-c:a aac',
        '-movflags +faststart',
      ]),
    );
  });

  it('should never disable autorotation or use hardware acceleration', () => {
    const command = getCastCommand(config, stream({ rotation: 90 }));
    const all = [...command.inputOptions, ...command.outputOptions].join(' ');
    expect(all).not.toContain('noautorotate');
    expect(all).not.toContain('hwaccel');
    expect(command.outputOptions).toContain('-vf scale=606:1080,format=yuv420p');
  });

  it('should copy aac audio', () => {
    const command = getCastCommand(config, stream(), { index: 1, codecName: 'aac', bitrate: 0 });
    expect(command.outputOptions).toContain('-c:a copy');
  });

  it('should not map audio when there is none', () => {
    const command = getCastCommand(config, stream());
    expect(command.outputOptions.some((option) => option.startsWith('-c:a'))).toBe(false);
    expect(command.outputOptions.filter((option) => option.startsWith('-map 0:'))).toEqual(['-map 0:0']);
  });

  it('should tone-map hdr sources, even when tone-mapping is disabled', () => {
    const command = getCastCommand(
      { ...config, tonemap: ToneMapping.Disabled },
      stream({ isHDR: true, pixelFormat: 'yuv420p10le' }),
    );
    expect(command.outputOptions).toContain(
      '-vf scale=1920:1080,tonemapx=tonemap=hable:desat=0:p=bt709:t=bt709:m=bt709:r=pc:peak=100:format=yuv420p',
    );
  });

  it('should use default crf and preset when the configured codec is not h264', () => {
    const command = getCastCommand({ ...config, targetVideoCodec: VideoCodec.Av1, crf: 45, preset: '8' }, stream());
    expect(command.outputOptions).toEqual(expect.arrayContaining(['-crf 23', '-preset medium']));
  });

  it('should honour thread limits', () => {
    const command = getCastCommand({ ...config, threads: 1 }, stream());
    expect(command.outputOptions).toEqual(
      expect.arrayContaining(['-threads 1', '-x264-params frame-threads=1:pools=none']),
    );
  });
});
