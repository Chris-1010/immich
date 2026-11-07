import 'package:auto_route/auto_route.dart';
import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/presentation/widgets/memory/memory_lane.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/infrastructure/memory.provider.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/widgets/common/immich_sliver_app_bar.dart';

@RoutePage()
class MainTimelinePage extends ConsumerWidget {
  const MainTimelinePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasMemories = ref.watch(driftMemoryFutureProvider.select((state) => state.value?.isNotEmpty ?? false));
    return Timeline(
      appBar: const ImmichSliverAppBar(floating: true, pinned: false, snap: false, actions: [_TimelineSortButton()]),
      topSliverWidget: const SliverToBoxAdapter(child: DriftMemoryLane()),
      topSliverWidgetHeight: hasMemories ? 200 : 0,
      showStorageIndicator: true,
      selectionActions: const [_TimelineSortButton(filled: true)],
    );
  }
}

/// Toggles the main timeline between grouping by the date taken and the date added to Immich.
///
/// While assets are selected it also scrolls to the first selected asset in the new order.
class _TimelineSortButton extends ConsumerWidget {
  const _TimelineSortButton({this.filled = false});

  /// Gives the button a background so it stays readable over the photos when the app bar is hidden.
  final bool filled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sortByDateAdded = ref.watch(settingsProvider).get(Setting.timelineSortByDateAdded);
    final label = sortByDateAdded ? context.t.sort_by_date_added : context.t.sort_by_date_taken;

    Future<void> toggle() async {
      final next = !sortByDateAdded;
      final selectedAsset = ref.read(multiSelectProvider).selectedAssets.firstOrNull;
      context.scaffoldMessenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 2),
            content: Text(next ? context.t.sort_by_date_added : context.t.sort_by_date_taken),
          ),
        );

      await ref.read(settingsProvider.notifier).set(Setting.timelineSortByDateAdded, next);
      if (selectedAsset == null) return;
      final date = await ref.read(timelineFactoryProvider).mainSortDate(selectedAsset);
      EventStream.shared.emit(ScrollToAssetEvent(selectedAsset, date));
    }

    final icon = Icon(sortByDateAdded ? Icons.cloud_upload_outlined : Icons.calendar_today_outlined);
    return filled
        ? IconButton.filledTonal(icon: icon, tooltip: label, onPressed: toggle)
        : IconButton(icon: icon, tooltip: label, onPressed: toggle);
  }
}
