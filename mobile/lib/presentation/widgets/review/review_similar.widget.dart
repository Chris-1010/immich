import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_viewer.page.dart';
import 'package:immich_mobile/presentation/widgets/review/review_preview_image.widget.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:openapi/api.dart' show AssetMediaSize;

/// The most look-alikes shown in the sheet.
const _maxSimilar = 6;

/// Pill over the review card saying how many library assets look like the current one. Reads the
/// look-alikes the notifier already fetched for the visit; hidden while there are none.
class ReviewSimilarPill extends ConsumerWidget {
  const ReviewSimilarPill({super.key, required this.assetId, required this.onTap});

  final String assetId;
  final ValueChanged<List<ReviewSimilarAsset>> onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final similar = ref.watch(reviewProvider.select((state) => state.similar[assetId]));
    if (similar == null || similar.isEmpty) {
      return const SizedBox.shrink();
    }

    return Material(
      color: Colors.black.withValues(alpha: 0.55),
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () => onTap(similar),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.photo_library_outlined, color: Colors.white, size: 18),
              const SizedBox(width: 6),
              Text(
                'pending_review_similar'.t(context: context, args: {'count': similar.length}),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shows up to six look-alikes, closest first. Resolves to the tapped library asset's id, or null
/// when the sheet is dismissed.
Future<String?> showReviewSimilarSheet(BuildContext context, List<ReviewSimilarAsset> similar) {
  final closest = [...similar]..sort((a, b) => a.distance.compareTo(b.distance));
  final shown = closest.take(_maxSimilar).toList();

  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'pending_review_similar_title'.t(context: context),
              style: context.textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 4,
              crossAxisSpacing: 4,
              children: [
                for (final asset in shown)
                  ClipRRect(
                    borderRadius: const BorderRadius.all(Radius.circular(8)),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ReviewPreviewImage(assetId: asset.assetId, size: AssetMediaSize.thumbnail, fit: BoxFit.cover),
                        Material(
                          type: MaterialType.transparency,
                          child: InkWell(onTap: () => Navigator.of(context).pop(asset.assetId)),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

/// Opens a library asset full screen. Uses the normal asset viewer when the asset is in the local
/// database (it arrives there through sync); otherwise falls back to a plain zoomable preview.
/// Completes when the viewer is closed.
Future<void> openReviewLibraryAsset(BuildContext context, WidgetRef ref, String assetId) async {
  final asset = await ref.read(assetServiceProvider).getRemoteAsset(assetId);
  if (!context.mounted) {
    return;
  }

  if (asset == null) {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => _ReviewLibraryPreviewPage(assetId: assetId)),
    );
    return;
  }

  AssetViewer.setAsset(ref, asset);
  await context.pushRoute(
    AssetViewerRoute(
      initialIndex: 0,
      timelineService: ref.read(timelineFactoryProvider).fromAssets([asset], TimelineOrigin.deepLink),
    ),
  );
}

class _ReviewLibraryPreviewPage extends StatelessWidget {
  const _ReviewLibraryPreviewPage({required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white),
      body: InteractiveViewer(
        maxScale: 5,
        child: Center(child: ReviewPreviewImage(assetId: assetId)),
      ),
    );
  }
}
