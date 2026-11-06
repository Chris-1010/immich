import 'dart:async';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/saved_location.model.dart';
import 'package:immich_mobile/repositories/saved_location_api.repository.dart';

final savedLocationsProvider = AsyncNotifierProvider<SavedLocationsNotifier, List<SavedLocation>>(
  SavedLocationsNotifier.new,
);

/// The user's saved locations, in name order, kept on the server.
class SavedLocationsNotifier extends AsyncNotifier<List<SavedLocation>> {
  SavedLocationApiRepository get _repository => ref.read(savedLocationApiRepositoryProvider);

  @override
  Future<List<SavedLocation>> build() => ref.watch(savedLocationApiRepositoryProvider).getAll();

  List<SavedLocation> _sorted(Iterable<SavedLocation> locations) =>
      locations.toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  Future<SavedLocation> add(String name, double latitude, double longitude) async {
    final created = await _repository.create(name.trim(), latitude, longitude);
    state = AsyncData(_sorted([...?state.valueOrNull, created]));
    return created;
  }

  Future<void> rename(String id, String name) async {
    final renamed = await _repository.rename(id, name.trim());
    state = AsyncData(_sorted([...?state.valueOrNull?.where((l) => l.id != id), renamed]));
  }

  Future<void> remove(String id) async {
    await _repository.delete(id);
    state = AsyncData([...?state.valueOrNull?.where((l) => l.id != id)]);
  }
}

/// Whether the server has this remote asset marked No Location. Read on demand, because the sync
/// stream does not carry the flag. Errors read as "not marked".
final assetNoLocationProvider = FutureProvider.autoDispose.family<bool, String>((ref, assetId) async {
  try {
    return await ref.watch(savedLocationApiRepositoryProvider).getNoLocation(assetId);
  } catch (_) {
    return false;
  }
});
