import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/review/review_details_values.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';

/// Heart toggle over the review card. Shows the staged favourite flag over the asset's own and
/// saves a change as a staged edit. Hidden until the asset's details have loaded.
class ReviewFavoriteButton extends ConsumerWidget {
  const ReviewFavoriteButton({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asset = ref.watch(reviewProvider.select((state) => state.assets[assetId]));
    final edits = ref.watch(
      reviewProvider.select(
        (state) => state.items.firstWhereOrNull((item) => item.assetId == assetId)?.edits ?? ReviewEdits.empty,
      ),
    );
    if (asset == null) {
      return const SizedBox.shrink();
    }

    final values = ReviewDetailsValues.from(asset, edits);
    final isFavorite = values.isFavorite;

    return Material(
      color: Colors.black.withValues(alpha: 0.35),
      shape: const CircleBorder(),
      child: IconButton(
        tooltip: (isFavorite ? 'unfavorite' : 'favorite').t(context: context),
        icon: Icon(
          isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          color: isFavorite ? Colors.redAccent : Colors.white,
        ),
        onPressed: () =>
            unawaited(ref.read(reviewProvider.notifier).stageEdits(assetId, values.favoritePatch(!isFavorite))),
      ),
    );
  }
}
