import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/pages/common/settings.page.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';

bool _isShowingDialog = false;

/// Tells the user the cast receiver could not load the media.
///
/// With no LAN address configured, the likely cause is that the receiver cannot
/// reach the address the phone uses (e.g. Tailscale), so offer a shortcut to the
/// networking settings where a LAN address can be set.
void showCastLoadError(BuildContext context, String reason) {
  final hasLocalEndpoint = (Store.tryGet(StoreKey.localEndpoint) ?? '').trim().isNotEmpty;

  if (hasLocalEndpoint) {
    ImmichToast.show(
      context: context,
      msg: "cast_load_error".tr(args: [reason]),
      toastType: ToastType.error,
    );
    return;
  }

  // The receiver can report several errors for one failed load; show one dialog.
  if (_isShowingDialog) {
    return;
  }
  _isShowingDialog = true;

  showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text("cast_load_error_title".tr()),
      content: Text("cast_load_error_no_lan".tr(args: [reason])),
      actions: [
        TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: Text("close".tr())),
        TextButton(
          onPressed: () {
            Navigator.of(dialogContext).pop();
            context.pushRoute(SettingsSubRoute(section: SettingSection.networking));
          },
          child: Text("cast_set_lan_address".tr()),
        ),
      ],
    ),
  ).whenComplete(() => _isShowingDialog = false);
}
