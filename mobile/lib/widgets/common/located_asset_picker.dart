import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/infrastructure/repositories/timeline.repository.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

/// Every point on the map, so the map timeline query keeps only assets that have coordinates. The
/// eastern edge stops just short of 180, because LatLng wraps 180 round to -180 and would collapse
/// the box to a single meridian.
final _wholeWorld = LatLngBounds(southwest: const LatLng(-90, -180), northeast: const LatLng(90, 179.9999999));

/// Shows the user's timeline, limited to photos that have a location, and returns the one tapped.
Future<BaseAsset?> pickLocatedAsset(BuildContext context) => pickAsset(context, withLocation: true);

/// Shows the user's timeline and returns the asset tapped. [withLocation] limits it to assets that
/// have coordinates.
Future<BaseAsset?> pickAsset(BuildContext context, {bool withLocation = false}) async {
  // The selection app bar pops a Set when Done is pressed, so the route accepts any result.
  final result = await Navigator.of(
    context,
    rootNavigator: true,
  ).push<Object?>(MaterialPageRoute(builder: (_) => _AssetPickerPage(withLocation: withLocation)));
  return result is BaseAsset ? result : null;
}

class _AssetPickerPage extends ConsumerWidget {
  final bool withLocation;

  const _AssetPickerPage({required this.withLocation});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ProviderScope(
      overrides: [
        multiSelectProvider.overrideWith(
          () => MultiSelectNotifier(
            const MultiSelectState(selectedAssets: {}, lockedSelectionAssets: {}, forceEnable: true),
          ),
        ),
        timelineServiceProvider.overrideWith((ref) {
          final user = ref.watch(currentUserProvider);
          if (user == null) {
            throw Exception('User must be logged in to pick a photo');
          }
          final factory = ref.watch(timelineFactoryProvider);
          final timelineService = withLocation
              ? factory.map([user.id], TimelineMapOptions(bounds: _wholeWorld, includeArchived: true))
              : factory.remoteAssets(user.id);
          ref.onDispose(timelineService.dispose);
          return timelineService;
        }),
      ],
      child: const _SingleSelection(child: Timeline()),
    );
  }
}

/// Closes the page with the first asset tapped, turning the timeline's multi-select into a single pick.
class _SingleSelection extends ConsumerWidget {
  final Widget child;

  const _SingleSelection({required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(multiSelectProvider.select((s) => s.selectedAssets), (_, selected) {
      if (selected.isNotEmpty) {
        final asset = selected.first;
        // Leaving multi-select tells the tab shell to show its navigation bar again; without the
        // reset the bar stays hidden after this page closes.
        ref.read(multiSelectProvider.notifier).reset();
        Navigator.of(context).pop(asset);
      }
    });
    return child;
  }
}
