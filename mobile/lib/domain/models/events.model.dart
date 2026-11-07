import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';

// Timeline Events
class TimelineReloadEvent extends Event {
  const TimelineReloadEvent();
}

class ScrollToTopEvent extends Event {
  const ScrollToTopEvent();
}

class ScrollToDateEvent extends Event {
  final DateTime date;

  const ScrollToDateEvent(this.date);
}

/// Scrolls the timeline to [asset] once its buckets have been regrouped, e.g. after a sort change.
/// [date] is the date the asset is grouped under in the new order.
class ScrollToAssetEvent extends Event {
  final BaseAsset asset;
  final DateTime date;

  const ScrollToAssetEvent(this.asset, this.date);
}

// Asset Viewer Events
class ViewerShowDetailsEvent extends Event {
  const ViewerShowDetailsEvent();
}

class ViewerReloadAssetEvent extends Event {
  const ViewerReloadAssetEvent();
}

// Multi-Select Events
class MultiSelectToggleEvent extends Event {
  final bool isEnabled;
  const MultiSelectToggleEvent(this.isEnabled);
}

// Map Events
class MapMarkerReloadEvent extends Event {
  const MapMarkerReloadEvent();
}
