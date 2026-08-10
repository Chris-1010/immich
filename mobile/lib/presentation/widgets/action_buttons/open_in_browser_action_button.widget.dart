import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/action_buttons/base_action_button.widget.dart';
import 'package:immich_mobile/utils/debug_print.dart';
import 'package:url_launcher/url_launcher.dart';

class OpenInBrowserActionButton extends ConsumerWidget {
  final String remoteId;
  final TimelineOrigin origin;
  final bool iconOnly;
  final bool menuItem;
  final Color? iconColor;

  const OpenInBrowserActionButton({
    super.key,
    required this.remoteId,
    required this.origin,
    this.iconOnly = false,
    this.menuItem = false,
    this.iconColor,
  });

  void _onTap() async {
    final serverEndpoint = Store.get(StoreKey.serverEndpoint).replaceFirst('/api', '');

    String originPath = '';
    switch (origin) {
      case TimelineOrigin.favorite:
        originPath = '/favorites';
        break;
      case TimelineOrigin.trash:
        originPath = '/trash';
        break;
      case TimelineOrigin.archive:
        originPath = '/archive';
        break;
      default:
        break;
    }

    final url = '$serverEndpoint$originPath/photos/$remoteId';
    final uri = Uri.parse(url);
    if (!await canLaunchUrl(uri)) {
      return;
    }

    // Prefer an installed PWA: externalNonBrowserApplication only succeeds when a
    // non-browser app handles the link, so fall back to the browser when it fails.
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalNonBrowserApplication)) {
        return;
      }
    } catch (error) {
      dPrint(() => 'No non-browser app handles $uri: $error');
    }

    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return BaseActionButton(
      label: 'open_in_browser'.t(context: context),
      iconData: Icons.open_in_browser,
      iconColor: iconColor,
      iconOnly: iconOnly,
      menuItem: menuItem,
      onPressed: _onTap,
    );
  }
}
