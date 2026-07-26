import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/presentation/widgets/bottom_sheet/trash_bottom_sheet.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/server_info.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';

@RoutePage()
class DriftTrashPage extends StatelessWidget {
  const DriftTrashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      overrides: [
        timelineServiceProvider.overrideWith((ref) {
          final user = ref.watch(currentUserProvider);
          if (user == null) {
            throw Exception('User must be logged in to access trash');
          }

          final timelineService = ref.watch(timelineFactoryProvider).trash(user.id);
          ref.onDispose(timelineService.dispose);
          return timelineService;
        }),
      ],
      child: Timeline(
        appBar: SliverAppBar(
          title: Text('trash'.t(context: context)),
          floating: true,
          snap: true,
          pinned: true,
          centerTitle: true,
          elevation: 0,
          actions: const [_TrashSortButton()],
        ),
        topSliverWidgetHeight: 24,
        topSliverWidget: Consumer(
          builder: (context, ref, child) {
            final trashDays = ref.watch(serverInfoProvider.select((v) => v.serverConfig.trashDays));

            return SliverPadding(
              padding: const EdgeInsets.all(16.0),
              sliver: SliverToBoxAdapter(child: Text(context.t.trash_page_info(days: trashDays))),
            );
          },
        ),
        bottomSheet: const TrashBottomBar(),
      ),
    );
  }
}

/// Toggles the trash timeline between grouping by the date deleted and the date taken.
class _TrashSortButton extends ConsumerWidget {
  const _TrashSortButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sortByDateDeleted = ref.watch(settingsProvider).get(Setting.trashSortByDateDeleted);
    final label = sortByDateDeleted ? context.t.sort_by_date_deleted : context.t.sort_by_date_taken;

    return IconButton(
      icon: Icon(sortByDateDeleted ? Icons.auto_delete_outlined : Icons.calendar_today_outlined),
      tooltip: label,
      onPressed: () => ref.read(settingsProvider.notifier).set(Setting.trashSortByDateDeleted, !sortByDateDeleted),
    );
  }
}
