import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart' hide Store;
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/saved_location.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/extensions/asyncvalue_extensions.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/maplibrecontroller_extensions.dart';
import 'package:immich_mobile/presentation/widgets/images/remote_image_provider.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_mobile/providers/saved_location.provider.dart';
import 'package:immich_mobile/repositories/saved_location_api.repository.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
import 'package:immich_mobile/utils/map_utils.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';
import 'package:immich_mobile/widgets/common/located_asset_picker.dart';
import 'package:immich_mobile/widgets/map/map_theme_override.dart';
import 'package:logging/logging.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

final _log = Logger('LocationPicker');

/// What the picker offers besides picking a point.
enum NoLocationMode {
  /// Picking a point is the only choice, for example before an upload exists.
  none,

  /// The selection can be marked No Location.
  mark,

  /// The single asset being edited is already marked No Location and can be unassigned.
  unassign,
}

/// What the user chose in the picker.
sealed class LocationPickerResult {
  const LocationPickerResult();
}

/// A point on the map, with the name of the saved location or search result it came from, if any.
class PickedPoint extends LocationPickerResult {
  final LatLng latLng;
  final String? label;

  const PickedPoint(this.latLng, {this.label});
}

/// Mark the selection No Location ([value] true), or clear the marker on one asset ([value] false).
class PickedNoLocation extends LocationPickerResult {
  final bool value;

  const PickedNoLocation(this.value);
}

/// Opens the full-screen picker: a map to drop a pin on, one search over saved locations, people's
/// places and map places, and the user's saved locations. [assetDate] is the date of the asset being
/// located, where there is one, so From image opens the timeline at photos taken around then.
/// [assetId] is that asset's remote id, so the places of the people in it are suggested first.
Future<LocationPickerResult?> pickLocation({
  required BuildContext context,
  LatLng? initialLatLng,
  NoLocationMode noLocationMode = NoLocationMode.none,
  DateTime? assetDate,
  String? assetId,
}) {
  return Navigator.of(context, rootNavigator: true).push<LocationPickerResult>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => _LocationPickerPage(
        initialLatLng: initialLatLng,
        noLocationMode: noLocationMode,
        assetDate: assetDate,
        assetId: assetId,
      ),
    ),
  );
}

/// Picks a point only, for callers that have no No Location choice to offer.
Future<LatLng?> showLocationPicker({required BuildContext context, LatLng? initialLatLng}) async {
  final result = await pickLocation(context: context, initialLatLng: initialLatLng);
  return result is PickedPoint ? result.latLng : null;
}

class _LocationPickerPage extends HookConsumerWidget {
  final LatLng? initialLatLng;
  final NoLocationMode noLocationMode;
  final DateTime? assetDate;
  final String? assetId;

  const _LocationPickerPage({required this.initialLatLng, required this.noLocationMode, this.assetDate, this.assetId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = useState<LatLng?>(initialLatLng);
    final selectedLabel = useState<String?>(null);
    final controller = useRef<MapLibreMapController?>(null);
    final marker = useRef<Symbol?>(null);
    final searchController = useTextEditingController();
    final searchFocus = useFocusNode();
    final searchFocused = useState(false);
    final detectedPeople = useMemoized(() => _peopleInAsset(ref, assetId), [assetId]);

    useEffect(() {
      void listener() => searchFocused.value = searchFocus.hasFocus;
      searchFocus.addListener(listener);
      return () => searchFocus.removeListener(listener);
    }, [searchFocus]);

    Future<void> placeMarker(LatLng latLng) async {
      final map = controller.value;
      if (map == null) {
        return;
      }
      if (marker.value == null) {
        marker.value = await map.addMarkerAtLatLng(latLng);
      } else {
        await map.updateSymbol(marker.value!, SymbolOptions(geometry: latLng));
      }
    }

    Future<void> select(LatLng latLng, {String? label, bool zoomIn = false}) async {
      selected.value = latLng;
      selectedLabel.value = label;
      await placeMarker(latLng);
      final map = controller.value;
      if (map != null) {
        final zoom = map.cameraPosition?.zoom ?? 1;
        await map.animateCamera(
          zoomIn && zoom < 13 ? CameraUpdate.newLatLngZoom(latLng, 14) : CameraUpdate.newLatLng(latLng),
        );
      }
    }

    void selectResult(LocationSearchResult result) {
      if (result is PersonPlaceResult) {
        unawaited(_rememberPersonPlace(result.place));
      }
      searchFocus.unfocus();
      searchController.clear();
      unawaited(select(result.latLng, label: result.label, zoomIn: true));
    }

    Future<void> useCurrentLocation() async {
      final (position, _) = await MapUtils.checkPermAndGetLocation(context: context);
      if (position == null) {
        return;
      }
      await select(LatLng(position.latitude, position.longitude), zoomIn: true);
    }

    Future<void> saveSelected() async {
      final point = selected.value;
      if (point == null) {
        return;
      }
      final name = await _promptForName(
        context,
        title: 'location_picker_save_title'.tr(),
        initialValue: selectedLabel.value ?? '',
      );
      if (name == null) {
        return;
      }
      try {
        await ref.read(savedLocationsProvider.notifier).add(name, point.latitude, point.longitude);
        selectedLabel.value = name;
        if (context.mounted) {
          ImmichToast.show(
            context: context,
            msg: 'location_picker_saved_toast'.tr(namedArgs: {'name': name}),
          );
        }
      } catch (error, stack) {
        _log.warning('Failed to save location', error, stack);
        if (context.mounted) {
          ImmichToast.show(context: context, msg: 'location_picker_save_failed'.tr(), toastType: ToastType.error);
        }
      }
    }

    Future<void> openSaved() async {
      searchFocus.unfocus();
      final picked = await showModalBottomSheet<SavedLocation>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _SavedLocationsSheet(selected: selected, selectedLabel: selectedLabel, onSave: saveSelected),
      );
      if (picked != null) {
        await select(picked.latLng, label: picked.name, zoomIn: true);
      }
    }

    Future<void> pickFromImage() async {
      searchFocus.unfocus();
      final asset = await pickLocatedAsset(context, initialDate: assetDate);
      if (asset == null) {
        return;
      }
      final exif = await ref.read(assetServiceProvider).getExif(asset);
      final latitude = exif?.latitude;
      final longitude = exif?.longitude;
      if (latitude == null || longitude == null) {
        if (context.mounted) {
          ImmichToast.show(context: context, msg: 'location_picker_image_no_location'.tr(), toastType: ToastType.error);
        }
        return;
      }
      final city = exif?.city;
      await select(LatLng(latitude, longitude), label: city == null || city.isEmpty ? null : city, zoomIn: true);
    }

    Future<void> enterCoordinates() async {
      searchFocus.unfocus();
      final latLng = await showDialog<LatLng>(
        context: context,
        builder: (_) => _CoordinatesDialog(initial: selected.value),
      );
      if (latLng != null) {
        await select(latLng, zoomIn: true);
      }
    }

    final hasSearchPanel = searchFocused.value;
    final initial = initialLatLng;

    return MapThemeOverride(
      mapBuilder: (style) => Scaffold(
        resizeToAvoidBottomInset: false,
        body: Stack(
          children: [
            Positioned.fill(
              child: style.widgetWhen(
                onData: (style) => MapLibreMap(
                  initialCameraPosition: CameraPosition(
                    target: initial ?? const LatLng(0, 0),
                    zoom: initial == null ? 1 : 12,
                  ),
                  styleString: style,
                  onMapCreated: (map) => controller.value = map,
                  onStyleLoadedCallback: () async {
                    // A style reload drops symbols, so the pin is added afresh.
                    marker.value = null;
                    final point = selected.value;
                    if (point != null) {
                      await placeMarker(point);
                    }
                  },
                  onMapClick: (Point<num> _, LatLng latLng) {
                    searchFocus.unfocus();
                    unawaited(select(latLng));
                  },
                  tiltGesturesEnabled: false,
                  rotateGesturesEnabled: false,
                  myLocationEnabled: false,
                  compassEnabled: false,
                  attributionButtonPosition: AttributionButtonPosition.topRight,
                  attributionButtonMargins: const Point(8, 76),
                ),
              ),
            ),
            if (hasSearchPanel)
              Positioned.fill(
                child: GestureDetector(
                  onTap: searchFocus.unfocus,
                  child: ColoredBox(color: Colors.black.withValues(alpha: 0.25)),
                ),
              ),
            SafeArea(
              // Focusing the search inserts the dimming layer above, which would otherwise rebuild
              // the field and drop the keyboard the tap just raised.
              key: const ValueKey('search'),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _SearchBar(
                      controller: searchController,
                      focusNode: searchFocus,
                      onClose: () => Navigator.of(context).maybePop(),
                    ),
                    if (hasSearchPanel)
                      Flexible(
                        child: _SearchResults(
                          query: searchController,
                          detectedPeople: detectedPeople,
                          onSelected: selectResult,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            if (!hasSearchPanel)
              Align(
                alignment: Alignment.bottomCenter,
                child: _BottomPanel(
                  selected: selected.value,
                  selectedLabel: selectedLabel.value,
                  noLocationMode: noLocationMode,
                  onOpenSaved: openSaved,
                  onFromImage: pickFromImage,
                  onEnterCoordinates: enterCoordinates,
                  onCurrentLocation: useCurrentLocation,
                  onUse: () {
                    final point = selected.value;
                    if (point != null) {
                      Navigator.of(context).pop(PickedPoint(point, label: selectedLabel.value));
                    }
                  },
                  onNoLocation: () =>
                      Navigator.of(context).pop(PickedNoLocation(noLocationMode == NoLocationMode.mark)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onClose;

  const _SearchBar({required this.controller, required this.focusNode, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 3,
      borderRadius: BorderRadius.circular(28),
      color: context.colorScheme.surfaceContainerHigh,
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            onPressed: onClose,
          ),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'location_picker_search_hint'.tr(),
                border: InputBorder.none,
                isDense: true,
              ),
            ),
          ),
          ValueListenableBuilder(
            valueListenable: controller,
            builder: (_, value, __) => value.text.isEmpty
                ? const SizedBox(width: 12)
                : IconButton(icon: const Icon(Icons.close_rounded), onPressed: controller.clear),
          ),
        ],
      ),
    );
  }
}

/// The combined search, refreshed as the user types. An empty field lists saved locations, then
/// the places of the people in the asset, then the people's places picked most recently.
class _SearchResults extends HookConsumerWidget {
  final TextEditingController query;
  final Future<Set<String>> detectedPeople;
  final void Function(LocationSearchResult) onSelected;

  const _SearchResults({required this.query, required this.detectedPeople, required this.onSelected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = useValueListenable(query).text.trim();
    final debounced = useState(text);
    final results = useState<AsyncValue<List<LocationSearchResult>>>(const AsyncLoading());

    useEffect(() {
      final timer = Timer(Duration(milliseconds: text.isEmpty ? 0 : 300), () => debounced.value = text);
      return timer.cancel;
    }, [text]);

    useEffect(() {
      var cancelled = false;
      results.value = const AsyncLoading();
      final search = ref.read(savedLocationApiRepositoryProvider).search(debounced.value);
      final rows = debounced.value.isEmpty
          ? search.then((rows) async => orderBlankSearch(rows, await detectedPeople, _readRecentPersonPlaces()))
          : search;
      rows.then(
        (rows) {
          if (!cancelled) results.value = AsyncData(rows);
        },
        onError: (Object error, StackTrace stack) {
          _log.warning('Location search failed', error, stack);
          if (!cancelled) results.value = AsyncError(error, stack);
        },
      );
      return () => cancelled = true;
    }, [debounced.value, detectedPeople]);

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        elevation: 3,
        borderRadius: BorderRadius.circular(16),
        color: context.colorScheme.surfaceContainer,
        clipBehavior: Clip.antiAlias,
        child: results.value.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, __) => _Message('location_picker_search_failed'.tr()),
          data: (rows) {
            if (rows.isEmpty) {
              return _Message('no_results'.tr());
            }
            return ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 4),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              itemCount: rows.length,
              itemBuilder: (_, index) {
                final row = rows[index];
                final previous = index > 0 ? rows[index - 1] : null;
                final startsGroup = previous == null || previous.runtimeType != row.runtimeType;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (startsGroup && previous != null) const Divider(height: 1),
                    _SearchResultTile(result: row, onTap: () => onSelected(row)),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}

const _maxRecentPersonPlaces = 10;

/// The people the server found in the asset, or none if there is no asset or the lookup fails.
Future<Set<String>> _peopleInAsset(WidgetRef ref, String? assetId) async {
  if (assetId == null) {
    return const {};
  }
  try {
    final asset = await ref.read(apiServiceProvider).assetsApi.getAssetInfo(assetId);
    return {...?asset?.people.map((person) => person.id)};
  } catch (error, stack) {
    _log.warning('Failed to read the people in asset $assetId', error, stack);
    return const {};
  }
}

List<PersonPlace> _readRecentPersonPlaces() {
  final raw = Store.tryGet(StoreKey.recentPersonPlaces);
  if (raw == null) {
    return const [];
  }
  try {
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>().map(PersonPlace.fromJson).toList();
  } catch (error, stack) {
    _log.warning('Ignoring unreadable recent places', error, stack);
    return const [];
  }
}

/// Moves [place] to the front of the recent people's places, keeping the newest ten.
Future<void> _rememberPersonPlace(PersonPlace place) async {
  final recent = [
    place,
    ..._readRecentPersonPlaces().where((other) => other.detailId != place.detailId),
  ].take(_maxRecentPersonPlaces);
  await Store.put(StoreKey.recentPersonPlaces, jsonEncode(recent.map((p) => p.toJson()).toList()));
}

/// Orders the rows of a blank search: saved locations, then the places of the people in
/// [detectedPeople], then the [recent] people's places not already listed. Other people's places are
/// left out.
///
/// A recent place is shown as the server now has it. One the server no longer lists as current is
/// dropped, since it was deleted or ended; a former place was never in the blank search, so its
/// remembered copy is shown.
@visibleForTesting
List<LocationSearchResult> orderBlankSearch(
  List<LocationSearchResult> rows,
  Set<String> detectedPeople,
  List<PersonPlace> recent,
) {
  final places = rows.whereType<PersonPlaceResult>().map((row) => row.place).toList();
  final byDetail = {for (final place in places) place.detailId: place};
  final detected = places.where((place) => detectedPeople.contains(place.personId)).toList();
  final shown = {for (final place in detected) place.detailId};
  final recentRows = recent
      .where((place) => !shown.contains(place.detailId))
      .map((place) => byDetail[place.detailId] ?? (place.isCurrent ? null : place))
      .whereType<PersonPlace>()
      .take(_maxRecentPersonPlaces);
  return [
    ...rows.whereType<SavedLocationResult>(),
    ...detected.map(PersonPlaceResult.new),
    ...recentRows.map(PersonPlaceResult.new),
  ];
}

class _Message extends StatelessWidget {
  final String text;

  const _Message(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Text(text, textAlign: TextAlign.center, style: context.textTheme.bodyMedium),
    );
  }
}

class _SearchResultTile extends StatelessWidget {
  final LocationSearchResult result;
  final VoidCallback onTap;

  const _SearchResultTile({required this.result, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return switch (result) {
      SavedLocationResult(:final location) => ListTile(
        leading: Icon(Icons.bookmark_rounded, color: context.primaryColor),
        title: Text(location.name),
        subtitle: Text(_formatLatLng(location.latLng)),
        onTap: onTap,
      ),
      PersonPlaceResult(:final place) => ListTile(
        leading: CircleAvatar(backgroundImage: RemoteImageProvider(url: getFaceThumbnailUrl(place.personId))),
        title: Text(_personPlaceTitle(place)),
        subtitle: Text(
          [place.value, if (!place.isCurrent) _yearRange(place)].where((s) => s.isNotEmpty).join(' · '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        onTap: onTap,
      ),
      MapPlaceResult(:final place) => ListTile(
        leading: const Icon(Icons.place_outlined),
        title: Text(place.name),
        subtitle: place.region.isEmpty ? null : Text(place.region),
        onTap: onTap,
      ),
    };
  }
}

/// "Ethan's Home", or "Ethan's former home" once the detail has an end date.
String _personPlaceTitle(PersonPlace place) {
  final name = place.personName.isEmpty ? 'location_picker_unnamed_person'.tr() : place.personName;
  final kind = place.key.isEmpty ? place.kind : place.key;
  return place.isCurrent
      ? 'location_picker_person_place'.tr(namedArgs: {'name': name, 'kind': kind})
      : 'location_picker_person_former_place'.tr(namedArgs: {'name': name, 'kind': kind.toLowerCase()});
}

/// "2015 – 2021" from the detail's dates, using whichever ends are known.
String _yearRange(PersonPlace place) {
  String? year(String? date) => date != null && date.length >= 4 ? date.substring(0, 4) : null;
  final from = year(place.since);
  final to = year(place.until);
  if (from == null && to == null) {
    return '';
  }
  return '${from ?? '?'} – ${to ?? '?'}';
}

String _formatLatLng(LatLng latLng) => '${latLng.latitude.toStringAsFixed(4)}, ${latLng.longitude.toStringAsFixed(4)}';

class _BottomPanel extends StatelessWidget {
  final LatLng? selected;
  final String? selectedLabel;
  final NoLocationMode noLocationMode;
  final VoidCallback onOpenSaved;
  final VoidCallback onFromImage;
  final VoidCallback onEnterCoordinates;
  final VoidCallback onCurrentLocation;
  final VoidCallback onUse;
  final VoidCallback onNoLocation;

  const _BottomPanel({
    required this.selected,
    required this.selectedLabel,
    required this.noLocationMode,
    required this.onOpenSaved,
    required this.onFromImage,
    required this.onEnterCoordinates,
    required this.onCurrentLocation,
    required this.onUse,
    required this.onNoLocation,
  });

  @override
  Widget build(BuildContext context) {
    final point = selected;

    return Material(
      elevation: 8,
      color: context.colorScheme.surfaceContainer,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(point == null ? Icons.touch_app_outlined : Icons.place, color: context.primaryColor),
                  const SizedBox(width: 12),
                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: onEnterCoordinates,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            point == null
                                ? 'location_picker_tap_to_drop'.tr()
                                : (selectedLabel ?? _formatLatLng(point)),
                            style: context.textTheme.titleSmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (point != null && selectedLabel != null)
                            Text(
                              _formatLatLng(point),
                              style: context.textTheme.bodySmall?.copyWith(color: context.colorScheme.onSurfaceVariant),
                            ),
                        ],
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'location_picker_current_location'.tr(),
                    icon: const Icon(Icons.my_location_rounded),
                    onPressed: onCurrentLocation,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.bookmarks_outlined),
                      label: const Text('saved').tr(),
                      onPressed: onOpenSaved,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('location_picker_from_image').tr(),
                      onPressed: onFromImage,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (noLocationMode != NoLocationMode.none) ...[
                    Expanded(
                      child: TextButton.icon(
                        icon: Icon(
                          noLocationMode == NoLocationMode.mark
                              ? Icons.location_off_outlined
                              : Icons.location_on_outlined,
                        ),
                        label: Text(
                          noLocationMode == NoLocationMode.mark
                              ? 'location_picker_mark_no_location'.tr()
                              : 'location_picker_unassign_location'.tr(),
                        ),
                        onPressed: onNoLocation,
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: FilledButton(
                      onPressed: point == null ? null : onUse,
                      child: const Text('map_location_picker_page_use_location').tr(),
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
}

/// The saved locations, each with pick, rename and delete, and a row to save the current pin. Pops
/// the one picked.
class _SavedLocationsSheet extends ConsumerWidget {
  final ValueNotifier<LatLng?> selected;
  final ValueNotifier<String?> selectedLabel;
  final Future<void> Function() onSave;

  const _SavedLocationsSheet({required this.selected, required this.selectedLabel, required this.onSave});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(savedLocationsProvider);

    Future<void> rename(SavedLocation location) async {
      final name = await _promptForName(
        context,
        title: 'location_picker_rename_title'.tr(),
        initialValue: location.name,
      );
      if (name == null || name == location.name) {
        return;
      }
      try {
        await ref.read(savedLocationsProvider.notifier).rename(location.id, name);
      } catch (error, stack) {
        _log.warning('Failed to rename saved location', error, stack);
        if (context.mounted) {
          ImmichToast.show(context: context, msg: 'location_picker_save_failed'.tr(), toastType: ToastType.error);
        }
      }
    }

    Future<void> delete(SavedLocation location) async {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('location_picker_delete_title'.tr(namedArgs: {'name': location.name})),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('cancel').tr()),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text('delete'.tr(), style: TextStyle(color: ctx.colorScheme.error)),
            ),
          ],
        ),
      );
      if (confirmed != true) {
        return;
      }
      try {
        await ref.read(savedLocationsProvider.notifier).remove(location.id);
      } catch (error, stack) {
        _log.warning('Failed to delete saved location', error, stack);
        if (context.mounted) {
          ImmichToast.show(context: context, msg: 'location_picker_save_failed'.tr(), toastType: ToastType.error);
        }
      }
    }

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: context.height * 0.7),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('location_picker_saved_title'.tr(), style: context.textTheme.titleMedium),
          ),
          ListenableBuilder(
            listenable: Listenable.merge([selected, selectedLabel]),
            builder: (_, __) {
              final point = selected.value;
              return ListTile(
                enabled: point != null,
                leading: Icon(Icons.bookmark_add_outlined, color: point == null ? null : context.primaryColor),
                title: const Text('location_picker_save').tr(),
                subtitle: Text(
                  point == null
                      ? 'location_picker_tap_to_drop'.tr()
                      : [if (selectedLabel.value != null) selectedLabel.value!, _formatLatLng(point)].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                onTap: onSave,
              );
            },
          ),
          const Divider(height: 1),
          Flexible(
            child: saved.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, __) => _Message('location_picker_load_failed'.tr()),
              data: (locations) => locations.isEmpty
                  ? _Message('location_picker_no_saved'.tr())
                  : ListView.builder(
                      shrinkWrap: true,
                      padding: const EdgeInsets.only(bottom: 16),
                      itemCount: locations.length,
                      itemBuilder: (_, index) {
                        final location = locations[index];
                        return ListTile(
                          leading: Icon(Icons.bookmark_rounded, color: context.primaryColor),
                          title: Text(location.name),
                          subtitle: Text(_formatLatLng(location.latLng)),
                          onTap: () => Navigator.of(context).pop(location),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'rename'.tr(),
                                icon: const Icon(Icons.edit_outlined),
                                onPressed: () => rename(location),
                              ),
                              IconButton(
                                tooltip: 'delete'.tr(),
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () => delete(location),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Asks for a location name. Returns the trimmed name, or null when cancelled. A blank name cannot
/// be submitted.
Future<String?> _promptForName(BuildContext context, {required String title, String initialValue = ''}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _NameDialog(title: title, initialValue: initialValue),
  );
}

class _NameDialog extends HookWidget {
  final String title;
  final String initialValue;

  const _NameDialog({required this.title, required this.initialValue});

  @override
  Widget build(BuildContext context) {
    final controller = useTextEditingController(text: initialValue);
    final name = useValueListenable(controller).text.trim();

    void submit() {
      if (name.isNotEmpty) {
        Navigator.of(context).pop(name);
      }
    }

    return AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        maxLength: 200,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(labelText: 'name'.tr()),
        onSubmitted: (_) => submit(),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('cancel').tr()),
        TextButton(onPressed: name.isEmpty ? null : submit, child: const Text('save').tr()),
      ],
    );
  }
}

/// Typed latitude and longitude. A "lat, lng" pair pasted into either field fills both.
class _CoordinatesDialog extends HookWidget {
  final LatLng? initial;

  const _CoordinatesDialog({this.initial});

  @override
  Widget build(BuildContext context) {
    final latController = useTextEditingController(text: initial?.latitude.toStringAsFixed(6) ?? '');
    final lngController = useTextEditingController(text: initial?.longitude.toStringAsFixed(6) ?? '');
    final latText = useValueListenable(latController).text;
    final lngText = useValueListenable(lngController).text;

    useEffect(() {
      void splitPair(TextEditingController source) {
        final parts = source.text.split(RegExp(r'[,\s]+')).where((p) => p.isNotEmpty).toList();
        if (parts.length == 2 && double.tryParse(parts[0]) != null && double.tryParse(parts[1]) != null) {
          latController.text = parts[0];
          lngController.text = parts[1];
        }
      }

      void onLat() => splitPair(latController);
      void onLng() => splitPair(lngController);
      latController.addListener(onLat);
      lngController.addListener(onLng);
      return () {
        latController.removeListener(onLat);
        lngController.removeListener(onLng);
      };
    }, const []);

    final lat = double.tryParse(latText.trim());
    final lng = double.tryParse(lngText.trim());
    final latError = latText.trim().isNotEmpty && (lat == null || lat < -90 || lat > 90);
    final lngError = lngText.trim().isNotEmpty && (lng == null || lng < -180 || lng > 180);
    final valid = lat != null && lng != null && !latError && !lngError;

    void submit() {
      if (valid) {
        Navigator.of(context).pop(LatLng(lat, lng));
      }
    }

    InputDecoration decoration(String label, String range, bool error) =>
        InputDecoration(labelText: label, helperText: range, errorText: error ? range : null);

    final keyboard = const TextInputType.numberWithOptions(signed: true, decimal: true);
    final formatter = FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\-\s]'));

    return AlertDialog(
      title: const Text('location_picker_enter_coordinates').tr(),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: latController,
            autofocus: true,
            keyboardType: keyboard,
            inputFormatters: [formatter],
            textInputAction: TextInputAction.next,
            decoration: decoration('latitude'.tr(), '-90 – 90', latError),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: lngController,
            keyboardType: keyboard,
            inputFormatters: [formatter],
            decoration: decoration('longitude'.tr(), '-180 – 180', lngError),
            onSubmitted: (_) => submit(),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('cancel').tr()),
        TextButton(onPressed: valid ? submit : null, child: const Text('ok').tr()),
      ],
    );
  }
}
