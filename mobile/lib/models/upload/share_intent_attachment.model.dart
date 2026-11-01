// ignore_for_file: public_member_api_docs, sort_constructors_first
import 'dart:convert';
import 'dart:io';

import 'package:immich_mobile/utils/bytes_units.dart';
import 'package:path/path.dart';

enum ShareIntentAttachmentType { image, video }

enum UploadStatus { enqueued, running, complete, failed }

/// Date and location of an uploaded share-intent asset, as reported by the
/// server, plus which of them the user changed on the upload page.
class ShareIntentAssetDetails {
  /// Wall-clock date/time in the asset's own time zone. Only the date/time
  /// fields are meaningful; the instance's own zone is irrelevant.
  final DateTime? dateTime;
  final String? timeZone;
  final Duration? timeZoneOffset;
  final double? latitude;
  final double? longitude;
  final String? city;
  final String? state;
  final String? country;

  /// Waiting for the server to extract the asset's metadata.
  final bool isLoading;

  /// A location was set and the server has not reverse-geocoded it yet.
  final bool isGeocoding;
  final bool isDateEdited;
  final bool isLocationEdited;

  const ShareIntentAssetDetails({
    this.dateTime,
    this.timeZone,
    this.timeZoneOffset,
    this.latitude,
    this.longitude,
    this.city,
    this.state,
    this.country,
    this.isLoading = false,
    this.isGeocoding = false,
    this.isDateEdited = false,
    this.isLocationEdited = false,
  });

  const ShareIntentAssetDetails.loading() : this(isLoading: true);

  bool get hasLocation => latitude != null && longitude != null;

  /// "City, State, Country", skipping missing parts; null if none are known.
  String? get placeName {
    final parts = [city, state, country].whereType<String>().where((part) => part.isNotEmpty);
    return parts.isEmpty ? null : parts.join(', ');
  }

  /// A date of today almost always means the file had no EXIF date and the
  /// server fell back to the time the file was shared.
  bool get isToday {
    final date = dateTime;
    if (date == null) {
      return false;
    }
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  ShareIntentAssetDetails copyWith({
    DateTime? dateTime,
    String? timeZone,
    Duration? timeZoneOffset,
    double? latitude,
    double? longitude,
    String? city,
    String? state,
    String? country,
    bool? isLoading,
    bool? isGeocoding,
    bool? isDateEdited,
    bool? isLocationEdited,
  }) {
    return ShareIntentAssetDetails(
      dateTime: dateTime ?? this.dateTime,
      timeZone: timeZone ?? this.timeZone,
      timeZoneOffset: timeZoneOffset ?? this.timeZoneOffset,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      city: city ?? this.city,
      state: state ?? this.state,
      country: country ?? this.country,
      isLoading: isLoading ?? this.isLoading,
      isGeocoding: isGeocoding ?? this.isGeocoding,
      isDateEdited: isDateEdited ?? this.isDateEdited,
      isLocationEdited: isLocationEdited ?? this.isLocationEdited,
    );
  }
}

class ShareIntentAttachment {
  final String path;

  // enum
  final ShareIntentAttachmentType type;

  // enum
  final UploadStatus status;

  final double uploadProgress;

  final int fileLength;

  /// Server asset id, set once the upload succeeds.
  final String? remoteAssetId;

  /// Null until the upload succeeds.
  final ShareIntentAssetDetails? details;

  ShareIntentAttachment({
    required this.path,
    required this.type,
    required this.status,
    this.uploadProgress = 0,
    this.fileLength = 0,
    this.remoteAssetId,
    this.details,
  });

  int get id => hash(path);

  File get file => File(path);

  String get fileName => basename(file.path);

  bool get isImage => type == ShareIntentAttachmentType.image;

  bool get isVideo => type == ShareIntentAttachmentType.video;

  String? _fileSize;

  String get fileSize => _fileSize ??= formatHumanReadableBytes(fileLength, 2);

  ShareIntentAttachment copyWith({
    String? path,
    ShareIntentAttachmentType? type,
    UploadStatus? status,
    double? uploadProgress,
    String? remoteAssetId,
    ShareIntentAssetDetails? details,
  }) {
    return ShareIntentAttachment(
      path: path ?? this.path,
      type: type ?? this.type,
      status: status ?? this.status,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      fileLength: fileLength,
      remoteAssetId: remoteAssetId ?? this.remoteAssetId,
      details: details ?? this.details,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'path': path,
      'type': type.index,
      'status': status.index,
      'uploadProgress': uploadProgress,
    };
  }

  factory ShareIntentAttachment.fromMap(Map<String, dynamic> map) {
    return ShareIntentAttachment(
      path: map['path'] as String,
      type: ShareIntentAttachmentType.values[map['type'] as int],
      status: UploadStatus.values[map['status'] as int],
      uploadProgress: map['uploadProgress'] as double,
    );
  }

  String toJson() => json.encode(toMap());

  factory ShareIntentAttachment.fromJson(String source) =>
      ShareIntentAttachment.fromMap(json.decode(source) as Map<String, dynamic>);

  @override
  String toString() {
    return 'ShareIntentAttachment(path: $path, type: $type, status: $status, uploadProgress: $uploadProgress)';
  }

  @override
  bool operator ==(covariant ShareIntentAttachment other) {
    if (identical(this, other)) return true;

    return other.path == path && other.type == type;
  }

  @override
  int get hashCode {
    return path.hashCode ^ type.hashCode;
  }
}
