import 'dart:io';

import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/models/upload/share_intent_attachment.model.dart';
import 'package:immich_mobile/pages/common/large_leading_tile.dart';
import 'package:immich_mobile/providers/asset_viewer/share_intent_upload.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/url_helper.dart';
import 'package:immich_mobile/widgets/common/date_time_picker.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';
import 'package:immich_mobile/widgets/common/location_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

const _appTaskChannel = MethodChannel('immich/app_task');

bool _isUploadedAsset(ShareIntentAttachment attachment) =>
    attachment.status == UploadStatus.complete && attachment.remoteAssetId != null;

@RoutePage()
class ShareIntentPage extends ConsumerWidget {
  const ShareIntentPage({super.key, required this.attachments});

  final List<ShareIntentAttachment> attachments;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentEndpoint = getServerUrl() ?? '--';
    final candidates = ref.watch(shareIntentUploadProvider);

    final isUploading = candidates.any((candidate) => candidate.status == UploadStatus.running);
    final isUploaded =
        candidates.isNotEmpty &&
        candidates.every(
          (candidate) => candidate.status == UploadStatus.complete || candidate.status == UploadStatus.failed,
        );
    final hasUploadedAssets = candidates.any(_isUploadedAsset);

    void removeAttachment(ShareIntentAttachment attachment) {
      ref.read(shareIntentUploadProvider.notifier).removeAttachment(attachment);
    }

    void addAttachments(List<ShareIntentAttachment> attachments) {
      ref.read(shareIntentUploadProvider.notifier).addAttachments(attachments);
    }

    void upload() async {
      final files = candidates.map((candidate) => candidate.file).toList();
      await ref.read(shareIntentUploadProvider.notifier).uploadAll(files);
    }

    bool isSelected(ShareIntentAttachment attachment) {
      return candidates.contains(attachment);
    }

    void toggleSelection(ShareIntentAttachment attachment) {
      if (isSelected(attachment)) {
        removeAttachment(attachment);
      } else {
        addAttachments([attachment]);
      }
    }

    void goToTimeline() {
      context.navigateTo(Store.isBetaTimelineEnabled ? const TabShellRoute() : const TabControllerRoute());
    }

    Future<void> confirm() async {
      // Hand the user back to the app they shared from; Immich stays on its
      // timeline for the next time it is opened.
      if (Platform.isAndroid) {
        await _appTaskChannel.invokeMethod<bool>('moveToBack');
      }
      goToTimeline();
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          children: [
            const Text('upload_to_immich').tr(namedArgs: {'count': candidates.length.toString()}),
            Text(
              currentEndpoint,
              style: context.textTheme.labelMedium?.copyWith(color: context.colorScheme.onSurface.withAlpha(200)),
            ),
          ],
        ),
        leading: IconButton(onPressed: goToTimeline, icon: const Icon(Icons.arrow_back)),
        actions: [
          IconButton(
            onPressed: hasUploadedAssets ? () => _setLocationForAll(context, ref) : null,
            tooltip: 'share_intent_set_location_for_all'.tr(),
            icon: const Icon(Icons.edit_location_alt_outlined),
          ),
        ],
      ),
      body: ListView.builder(
        itemCount: attachments.length,
        itemBuilder: (context, index) {
          final attachment = attachments[index];
          final target = candidates.firstWhere((element) => element.id == attachment.id, orElse: () => attachment);
          final selected = isSelected(attachment);
          final details = target.details;
          final showDetails = selected && _isUploadedAsset(target) && details != null;

          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4.0, horizontal: 16),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: selected ? Theme.of(context).primaryColor.withAlpha(30) : Colors.transparent,
                borderRadius: const BorderRadius.all(Radius.circular(20)),
              ),
              child: Column(
                children: [
                  LargeLeadingTile(
                    onTap: () => toggleSelection(attachment),
                    disabled: isUploading || isUploaded,
                    selected: selected,
                    selectedTileColor: Colors.transparent,
                    leading: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: const BorderRadius.all(Radius.circular(16)),
                          child: attachment.isImage
                              ? Image.file(attachment.file, width: 64, height: 64, fit: BoxFit.cover)
                              : const SizedBox(
                                  width: 64,
                                  height: 64,
                                  child: Center(child: Icon(Icons.videocam, color: Colors.white)),
                                ),
                        ),
                        if (attachment.isImage)
                          const Positioned(
                            top: 8,
                            right: 8,
                            child: Icon(
                              Icons.image,
                              color: Colors.white,
                              size: 20,
                              shadows: [Shadow(offset: Offset(0, 0), blurRadius: 8.0, color: Colors.black45)],
                            ),
                          ),
                      ],
                    ),
                    title: Text(attachment.fileName, style: context.textTheme.titleSmall),
                    subtitle: Text(attachment.fileSize, style: context.textTheme.labelLarge),
                    trailing: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (selected && target.status == UploadStatus.failed)
                            IconButton(
                              onPressed: () => ref.read(shareIntentUploadProvider.notifier).retry(target),
                              tooltip: 'retry_upload'.tr(),
                              icon: const Icon(Icons.refresh_rounded),
                            ),
                          UploadStatusIcon(selected: selected, status: target.status, progress: target.uploadProgress),
                        ],
                      ),
                    ),
                  ),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment.topCenter,
                    child: showDetails
                        ? Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _AssetDetailsBar(attachment: target, details: details),
                          )
                        : const SizedBox(width: double.infinity),
                  ),
                ],
              ),
            ),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: AnimatedSize(
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOutCubic,
            alignment: Alignment.bottomCenter,
            child: isUploaded
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _UploadResultPill(candidates: candidates),
                      const SizedBox(height: 8),
                      _FadeIn(
                        child: SizedBox(
                          height: 48,
                          width: double.infinity,
                          child: ElevatedButton(onPressed: confirm, child: const Text('confirm').tr()),
                        ),
                      ),
                    ],
                  )
                : SizedBox(
                    height: 48,
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: isUploading ? null : upload,
                      child: isUploading ? UploadingText(candidates: candidates) : const Text('upload').tr(),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

enum _LocationScope { missing, all }

/// Picks a location and applies it to every uploaded asset, asking first
/// whether to overwrite assets that already have one.
Future<void> _setLocationForAll(BuildContext context, WidgetRef ref) async {
  final location = await showLocationPicker(context: context);
  if (location == null || !context.mounted) {
    return;
  }

  final uploaded = ref.read(shareIntentUploadProvider).where(_isUploadedAsset).toList();
  final missing = uploaded.where((attachment) => attachment.details?.hasLocation != true).toList();

  var scope = _LocationScope.all;
  if (missing.length != uploaded.length) {
    final picked = await showDialog<_LocationScope>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('share_intent_apply_location_title').tr(),
        actions: [
          TextButton(onPressed: () => context.pop(), child: const Text('cancel').tr()),
          if (missing.isNotEmpty)
            TextButton(
              onPressed: () => context.pop(_LocationScope.missing),
              child: const Text(
                'share_intent_location_only_missing',
              ).tr(namedArgs: {'count': missing.length.toString()}),
            ),
          TextButton(
            onPressed: () => context.pop(_LocationScope.all),
            child: const Text('share_intent_location_all').tr(namedArgs: {'count': uploaded.length.toString()}),
          ),
        ],
      ),
    );
    if (picked == null) {
      return;
    }
    scope = picked;
  }

  if (!context.mounted) {
    return;
  }
  await _saveLocation(context, ref, scope == _LocationScope.missing ? missing : uploaded, location);
}

Future<bool> _saveLocation(
  BuildContext context,
  WidgetRef ref,
  List<ShareIntentAttachment> attachments,
  LatLng location,
) async {
  try {
    await ref.read(shareIntentUploadProvider.notifier).updateLocation(attachments, location);
    return true;
  } catch (error) {
    if (context.mounted) {
      ImmichToast.show(context: context, msg: 'share_intent_update_failed'.tr(), toastType: ToastType.error);
    }
    return false;
  }
}

/// Date and location buttons shown under an uploaded asset's row.
class _AssetDetailsBar extends ConsumerWidget {
  const _AssetDetailsBar({required this.attachment, required this.details});

  final ShareIntentAttachment attachment;
  final ShareIntentAssetDetails details;

  Future<void> _editDate(BuildContext context, WidgetRef ref) async {
    final picked = await showDateTimePicker(
      context: context,
      initialDateTime: details.dateTime,
      initialTZ: details.timeZone,
      initialTZOffset: details.timeZoneOffset,
    );
    if (picked == null) {
      return;
    }

    try {
      await ref.read(shareIntentUploadProvider.notifier).updateDateTime(attachment, picked);
    } catch (error) {
      if (context.mounted) {
        ImmichToast.show(context: context, msg: 'share_intent_update_failed'.tr(), toastType: ToastType.error);
      }
    }
  }

  Future<void> _editLocation(BuildContext context, WidgetRef ref) async {
    final location = await showLocationPicker(
      context: context,
      initialLatLng: details.hasLocation ? LatLng(details.latitude!, details.longitude!) : null,
    );
    if (location == null || !context.mounted) {
      return;
    }

    final saved = await _saveLocation(context, ref, [attachment], location);
    if (!saved || !context.mounted) {
      return;
    }

    // Offer to fill in the gaps only; never overwrite another asset's location
    // from a quick prompt. Assets still loading may have their own GPS data.
    final missing = ref
        .read(shareIntentUploadProvider)
        .where(
          (other) =>
              other.id != attachment.id &&
              _isUploadedAsset(other) &&
              other.details != null &&
              !other.details!.isLoading &&
              !other.details!.hasLocation,
        )
        .toList();
    if (missing.isEmpty) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          content: const Text('share_intent_apply_location_prompt').tr(namedArgs: {'count': missing.length.toString()}),
          action: SnackBarAction(
            label: 'share_intent_apply'.tr(),
            onPressed: () => _saveLocation(context, ref, missing, location),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isLoading = details.isLoading;
    final dateTime = details.dateTime;
    final isToday = details.isToday && !details.isDateEdited;

    final Widget dateLabel;
    if (isLoading || dateTime == null) {
      dateLabel = const Text('…');
    } else if (isToday) {
      dateLabel = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.amber.withAlpha(60),
              borderRadius: const BorderRadius.all(Radius.circular(6)),
            ),
            child: Text('share_intent_today'.tr(), style: context.textTheme.labelSmall),
          ),
          const SizedBox(width: 6),
          Text(DateFormat('HH:mm').format(dateTime)),
        ],
      );
    } else {
      dateLabel = Text(DateFormat('dd/MM/yy HH:mm').format(dateTime));
    }

    final String locationText;
    if (isLoading) {
      locationText = '…';
    } else if (details.placeName != null) {
      locationText = details.placeName!;
    } else if (details.hasLocation) {
      locationText = '${details.latitude!.toStringAsFixed(2)}, ${details.longitude!.toStringAsFixed(2)}';
    } else {
      locationText = 'add_location'.tr();
    }

    return Row(
      children: [
        _DetailButton(
          icon: Icon(Icons.schedule_rounded, color: isToday ? Colors.amber.shade700 : null),
          label: dateLabel,
          isEdited: details.isDateEdited,
          onPressed: isLoading ? null : () => _editDate(context, ref),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _DetailButton(
            icon: const Icon(Icons.location_on_outlined),
            label: Text(locationText, maxLines: 1, overflow: TextOverflow.ellipsis),
            isEdited: details.isLocationEdited,
            onPressed: isLoading ? null : () => _editLocation(context, ref),
          ),
        ),
      ],
    );
  }
}

class _DetailButton extends StatelessWidget {
  const _DetailButton({required this.icon, required this.label, required this.isEdited, required this.onPressed});

  final Widget icon;
  final Widget label;

  /// Changed by the user on this page; drawn with a highlighted border.
  final bool isEdited;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = context.colorScheme;
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: IconTheme.merge(data: const IconThemeData(size: 18), child: icon),
      label: label,
      style: OutlinedButton.styleFrom(
        visualDensity: VisualDensity.compact,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        foregroundColor: colorScheme.onSurface,
        textStyle: context.textTheme.labelLarge,
        side: BorderSide(color: isEdited ? colorScheme.primary : colorScheme.outlineVariant, width: isEdited ? 2 : 1),
        backgroundColor: isEdited ? colorScheme.primary.withAlpha(20) : null,
      ),
    );
  }
}

/// Upload summary shown once every upload has finished: green when all
/// succeeded, amber when some failed and red when all failed.
class _UploadResultPill extends StatelessWidget {
  const _UploadResultPill({required this.candidates});

  final List<ShareIntentAttachment> candidates;

  @override
  Widget build(BuildContext context) {
    final completed = candidates.where((candidate) => candidate.status == UploadStatus.complete).length;
    final color = switch (completed) {
      _ when completed == candidates.length => Colors.green.shade600,
      0 => context.colorScheme.error,
      _ => Colors.amber.shade800,
    };

    return Container(
      height: 48,
      width: double.infinity,
      alignment: Alignment.center,
      decoration: ShapeDecoration(color: color, shape: const StadiumBorder()),
      child: DefaultTextStyle.merge(
        style: context.textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
        child: UploadingText(candidates: candidates),
      ),
    );
  }
}

class _FadeIn extends StatelessWidget {
  const _FadeIn({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 400),
      curve: const Interval(0.3, 1, curve: Curves.easeOut),
      builder: (context, opacity, child) => Opacity(opacity: opacity, child: child),
      child: child,
    );
  }
}

class UploadingText extends StatelessWidget {
  const UploadingText({super.key, required this.candidates});
  final List<ShareIntentAttachment> candidates;

  @override
  Widget build(BuildContext context) {
    final uploadedCount = candidates.where((element) {
      return element.status == UploadStatus.complete;
    }).length;

    return const Text(
      "shared_intent_upload_button_progress_text",
    ).tr(namedArgs: {'current': uploadedCount.toString(), 'total': candidates.length.toString()});
  }
}

class UploadStatusIcon extends StatelessWidget {
  const UploadStatusIcon({super.key, required this.status, required this.selected, this.progress = 0});

  final UploadStatus status;
  final double progress;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    if (!selected) {
      return Icon(
        Icons.check_circle_outline_rounded,
        color: context.colorScheme.onSurface.withAlpha(100),
        semanticLabel: 'not_selected'.tr(),
      );
    }

    final statusIcon = switch (status) {
      UploadStatus.enqueued => Icon(
        Icons.check_circle_rounded,
        color: context.primaryColor,
        semanticLabel: 'enqueued'.tr(),
      ),
      UploadStatus.running => Stack(
        alignment: AlignmentDirectional.center,
        children: [
          SizedBox(
            width: 40,
            height: 40,
            child: TweenAnimationBuilder(
              tween: Tween<double>(begin: 0.0, end: progress),
              duration: const Duration(milliseconds: 500),
              builder: (context, value, _) => CircularProgressIndicator(
                backgroundColor: context.colorScheme.surfaceContainerLow,
                strokeWidth: 3,
                value: value,
                semanticsLabel: 'uploading'.tr(),
              ),
            ),
          ),
          Text(
            (progress * 100).toStringAsFixed(0),
            style: context.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
        ],
      ),
      UploadStatus.complete => Icon(Icons.check_circle_rounded, color: Colors.green, semanticLabel: 'completed'.tr()),
      UploadStatus.failed => Icon(Icons.error_rounded, color: Colors.red, semanticLabel: 'failed'.tr()),
    };

    return statusIcon;
  }
}
