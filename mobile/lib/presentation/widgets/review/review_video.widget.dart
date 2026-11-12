import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/extensions/duration_extensions.dart';
import 'package:immich_mobile/extensions/string_extensions.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/video_viewer.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_preview_image.widget.dart';
import 'package:immich_mobile/providers/asset_viewer/asset_viewer.provider.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';
import 'package:immich_mobile/widgets/asset_viewer/video_controls.dart';
import 'package:openapi/api.dart' show AssetResponseDto, AssetTypeEnum;

/// Whether a pending asset's details say it is a video.
bool isReviewVideo(AssetResponseDto? asset) => asset?.type == AssetTypeEnum.VIDEO;

/// Wraps a pending asset as a remote-only asset, so the normal video viewer can play it. The asset
/// is not in the local database (pending assets are excluded from sync); the viewer falls back to
/// the given asset and streams it from the server.
RemoteAsset reviewRemoteAsset(AssetResponseDto dto) => RemoteAsset(
  id: dto.id,
  name: dto.originalFileName,
  ownerId: dto.ownerId,
  checksum: dto.checksum,
  type: AssetType.video,
  createdAt: dto.fileCreatedAt,
  updatedAt: dto.updatedAt,
  width: dto.width?.toInt(),
  height: dto.height?.toInt(),
  durationInSeconds: dto.duration.toDuration()?.inSeconds ?? 0,
  isFavorite: dto.isFavorite,
  thumbHash: dto.thumbhash,
  livePhotoVideoId: dto.livePhotoVideoId,
  isEdited: dto.isEdited,
);

/// Play badge with the duration, over the card of a pending video. Hidden for images and until
/// the asset's details have loaded.
class ReviewVideoBadge extends ConsumerWidget {
  const ReviewVideoBadge({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asset = ref.watch(reviewProvider.select((state) => state.assets[assetId]));
    if (asset == null || !isReviewVideo(asset)) {
      return const SizedBox.shrink();
    }
    final duration = asset.duration.toDuration();

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: const BorderRadius.all(Radius.circular(16)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 4, 10, 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 22),
            if (duration != null) ...[
              const SizedBox(width: 2),
              Text(
                duration.format(),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Opens a full-screen player for a pending video. Completes when the player is closed.
Future<void> openReviewVideo(BuildContext context, AssetResponseDto dto) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => _ReviewVideoPage(asset: reviewRemoteAsset(dto))),
  );
}

/// The timeline's video viewer and controls on a plain page: no asset actions, since the asset is
/// still pending. Tap toggles the controls.
class _ReviewVideoPage extends ConsumerStatefulWidget {
  const _ReviewVideoPage({required this.asset});

  final RemoteAsset asset;

  @override
  ConsumerState<_ReviewVideoPage> createState() => _ReviewVideoPageState();
}

class _ReviewVideoPageState extends ConsumerState<_ReviewVideoPage> {
  @override
  void initState() {
    super.initState();
    // The controls and autoplay read the shared viewer state; start from a clean one.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(assetViewerProvider.notifier).reset();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final asset = widget.asset;
    final showControls = ref.watch(assetViewerProvider.select((state) => state.showingControls));
    final width = asset.width;
    final height = asset.height;
    final hasSize = width != null && height != null && width > 0 && height > 0;

    final viewer = NativeVideoViewer(
      asset: asset,
      isCurrent: true,
      image: ReviewPreviewImage(assetId: asset.id),
    );

    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
        toolbarOpacity: showControls ? 1 : 0,
      ),
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => ref.read(assetViewerProvider.notifier).toggleControls(),
        child: Stack(
          children: [
            Positioned.fill(
              child: Center(
                child: hasSize ? AspectRatio(aspectRatio: width / height, child: viewer) : viewer,
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: IgnorePointer(
                ignoring: !showControls,
                child: AnimatedOpacity(
                  opacity: showControls ? 1 : 0,
                  duration: const Duration(milliseconds: 150),
                  child: DecoratedBox(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [Colors.black45, Colors.transparent],
                      ),
                    ),
                    child: SafeArea(top: false, child: VideoControls(videoPlayerName: asset.heroTag)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
