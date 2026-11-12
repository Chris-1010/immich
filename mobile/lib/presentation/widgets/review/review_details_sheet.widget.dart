import 'dart:async';

import 'package:collection/collection.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/duration_extensions.dart';
import 'package:immich_mobile/extensions/theme_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/infrastructure/utils/exif.converter.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/drag_handle.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/sheet_tile.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_details_values.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';
import 'package:immich_mobile/utils/bytes_units.dart';
import 'package:immich_mobile/utils/option.dart';
import 'package:immich_mobile/widgets/common/date_time_picker.dart';
import 'package:openapi/api.dart';

const _kSeparator = '  •  ';

/// Opens the review details sheet for [assetId] and completes when it closes.
Future<void> showReviewDetailsSheet(BuildContext context, String assetId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 1,
      builder: (_, scrollController) => ReviewDetailsSheet(assetId: assetId, scrollController: scrollController),
    ),
  );
}

/// The details of a pending asset, laid out like the asset viewer's details sheet.
///
/// Reads the asset from `GET /assets/:id` (cached in [reviewProvider]) with its staged edits laid over,
/// and saves every change as a staged edit, applied only if the asset is kept at Finish review.
class ReviewDetailsSheet extends ConsumerStatefulWidget {
  const ReviewDetailsSheet({super.key, required this.assetId, this.scrollController});

  final String assetId;
  final ScrollController? scrollController;

  @override
  ConsumerState<ReviewDetailsSheet> createState() => _ReviewDetailsSheetState();
}

class _ReviewDetailsSheetState extends ConsumerState<ReviewDetailsSheet> {
  ReviewNotifier get _notifier => ref.read(reviewProvider.notifier);

  @override
  void initState() {
    super.initState();
    // Normally cached already; fetches it if the card was opened before the details arrived.
    unawaited(_notifier.loadAsset(widget.assetId));
  }

  Future<void> _stage(ReviewEditsPatch patch) => _notifier.stageEdits(widget.assetId, patch);

  Future<void> _editDateTime(ReviewDetailsValues values) async {
    final result = await showDateTimePicker(
      context: context,
      initialDateTime: values.dateTime,
      initialTZ: values.timeZone,
      initialTZOffset: values.offset,
    );
    if (result == null || DateTime.tryParse(result) == null) {
      return;
    }
    await _stage(ReviewEditsPatch(dateTimeOriginal: Option.some(result)));
  }

  @override
  Widget build(BuildContext context) {
    final asset = ref.watch(reviewProvider.select((state) => state.assets[widget.assetId]));
    final edits = ref.watch(
      reviewProvider.select(
        (state) => state.items.firstWhereOrNull((item) => item.assetId == widget.assetId)?.edits ?? ReviewEdits.empty,
      ),
    );

    final values = asset == null ? null : ReviewDetailsValues.from(asset, edits);

    return Container(
      decoration: BoxDecoration(
        color: context.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: ListView(
        controller: widget.scrollController,
        padding: EdgeInsets.zero,
        children: [
          const DragHandle(),
          if (asset == null || values == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            SheetTile(
              title: _formatDateTime(context, values),
              titleStyle: context.textTheme.labelLarge,
              trailing: const Icon(Icons.edit, size: 18),
              onTap: () => _editDateTime(values),
            ),
            _ReviewDescription(
              description: values.description,
              onSave: (value) => _stage(values.descriptionPatch(value)),
            ),
            _ReviewTechnicalDetails(asset: asset),
          ],
          SizedBox(height: context.padding.bottom + context.viewInsets.bottom + 48),
        ],
      ),
    );
  }

  static String _formatDateTime(BuildContext context, ReviewDetailsValues values) {
    final locale = context.locale.toLanguageTag();
    final date = DateFormat.yMMMEd(locale).format(values.dateTime);
    final time = DateFormat.jm(locale).format(values.dateTime);
    return '$date$_kSeparator$time GMT${values.offset.formatAsOffset()}';
  }
}

/// Description field, saved when focus leaves it, as in the asset viewer's details sheet.
class _ReviewDescription extends StatefulWidget {
  const _ReviewDescription({required this.description, required this.onSave});

  final String description;
  final Future<void> Function(String value) onSave;

  @override
  State<_ReviewDescription> createState() => _ReviewDescriptionState();
}

class _ReviewDescriptionState extends State<_ReviewDescription> {
  late final TextEditingController _controller = TextEditingController(text: widget.description);
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    _focus.unfocus();
    final value = _controller.text.trim();
    if (value == widget.description) {
      return;
    }
    // A failed save comes back as a review error, toasted by the page; the field then shows the
    // staged value again on the next build.
    await widget.onSave(value);
  }

  @override
  Widget build(BuildContext context) {
    if (_controller.text != widget.description && !_focus.hasFocus) {
      _controller.text = widget.description;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8),
      child: TextField(
        controller: _controller,
        keyboardType: TextInputType.multiline,
        maxLines: null,
        focusNode: _focus,
        decoration: InputDecoration(
          hintText: 'exif_bottom_sheet_description'.t(context: context),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          disabledBorder: InputBorder.none,
          errorBorder: InputBorder.none,
          focusedErrorBorder: InputBorder.none,
        ),
        onTapOutside: (_) {
          if (_focus.hasFocus) {
            unawaited(_save());
          }
        },
      ),
    );
  }
}

/// Read-only file, camera and lens details, as in the asset viewer's details sheet.
class _ReviewTechnicalDetails extends StatelessWidget {
  const _ReviewTechnicalDetails({required this.asset});

  final AssetResponseDto asset;

  @override
  Widget build(BuildContext context) {
    final exifDto = asset.exifInfo;
    final exif = exifDto == null ? null : ExifDtoConverter.fromDto(exifDto);
    final titleStyle = context.textTheme.labelLarge;
    final subtitleStyle = context.textTheme.bodyMedium?.copyWith(color: context.colorScheme.onSurfaceSecondary);
    final iconColor = titleStyle?.color;

    final width = exifDto?.exifImageWidth ?? asset.width;
    final height = exifDto?.exifImageHeight ?? asset.height;
    final resolution = width != null && height != null ? '${width.toInt()} x ${height.toInt()}' : null;
    final fileSize = exif?.fileSize != null ? formatBytes(exif!.fileSize!) : null;
    final fileInfo = [fileSize, resolution].nonNulls.join(_kSeparator);

    final camera = [exif?.make, exif?.model].nonNulls.join(' ');
    final cameraInfo = [
      if (exif != null && exif.exposureTime.isNotEmpty) exif.exposureTime,
      if (exif?.iso != null) 'ISO ${exif!.iso}',
    ].join(_kSeparator);
    final lens = exif?.lens;
    final lensInfo = [
      if (exif != null && exif.fNumber.isNotEmpty) 'ƒ/${exif.fNumber}',
      if (exif != null && exif.focalLength.isNotEmpty) '${exif.focalLength} mm',
    ].join(_kSeparator);

    return Column(
      children: [
        SheetTile(
          title: 'details'.t(context: context),
          titleStyle: context.textTheme.labelLarge?.copyWith(color: context.colorScheme.onSurfaceSecondary),
        ),
        SheetTile(
          title: asset.originalFileName,
          titleStyle: titleStyle,
          leading: Icon(
            asset.type == AssetTypeEnum.VIDEO ? Icons.videocam_outlined : Icons.image_outlined,
            size: 24,
            color: iconColor,
          ),
          subtitle: fileInfo,
          subtitleStyle: subtitleStyle,
        ),
        if (camera.isNotEmpty) ...[
          const SizedBox(height: 16),
          SheetTile(
            title: camera,
            titleStyle: titleStyle,
            leading: Icon(Icons.camera_alt_outlined, size: 24, color: iconColor),
            subtitle: cameraInfo,
            subtitleStyle: subtitleStyle,
          ),
        ],
        if (lens != null && lens.isNotEmpty) ...[
          const SizedBox(height: 16),
          SheetTile(
            title: lens,
            titleStyle: titleStyle,
            leading: Icon(Icons.camera_outlined, size: 24, color: iconColor),
            subtitle: lensInfo,
            subtitleStyle: subtitleStyle,
          ),
        ],
      ],
    );
  }
}
