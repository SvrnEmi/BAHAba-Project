import 'package:supabase_flutter/supabase_flutter.dart';

import 'posted_reports_service.dart';

/// One row of the view public.all_reports.
class AllReport {
  final String kind; // 'community' | 'quick'
  final int id;
  final String? source;
  final String? location;
  final String? waterLevel;
  final String? status;
  final DateTime? reportedAt;
  final String? reporterName;
  final String? photoPath;
  final String? photoBucket;
  final String? rejectionReason;

  const AllReport({
    required this.kind,
    required this.id,
    this.source,
    this.location,
    this.waterLevel,
    this.status,
    this.reportedAt,
    this.reporterName,
    this.photoPath,
    this.photoBucket,
    this.rejectionReason,
  });

  factory AllReport.fromRow(Map<String, dynamic> row) => AllReport(
        kind: (row['kind'] ?? 'community').toString(),
        id: (row['id'] as num).toInt(),
        source: row['source'] as String?,
        location: row['location'] as String?,
        waterLevel: row['water_level'] as String?,
        status: row['status'] as String?,
        reportedAt:
            DateTime.tryParse('${row['reported_at'] ?? ''}')?.toLocal(),
        reporterName: row['reporter_name'] as String?,
        photoPath: row['photo_path'] as String?,
        photoBucket: row['photo_bucket'] as String?,
        rejectionReason: row['rejection_reason'] as String?,
      );

  bool get isQuick => kind == 'quick';
}

/// Search, filters and sort. 'all' means no filter.
class AllReportsFilter {
  final String search;
  final String source;
  final String status;
  final String level;
  final String date; // all | today | 7d | 30d | custom
  final DateTime? from;
  final DateTime? to;
  final String sort; // newest | oldest | highest | lowest | status

  const AllReportsFilter({
    this.search = '',
    this.source = 'all',
    this.status = 'all',
    this.level = 'all',
    this.date = 'all',
    this.from,
    this.to,
    this.sort = 'newest',
  });

  bool get hasFilters =>
      source != 'all' || status != 'all' || level != 'all' || date != 'all';
  bool get narrowed => hasFilters || search.trim().isNotEmpty;

  AllReportsFilter copyWith({
    String? search,
    String? source,
    String? status,
    String? level,
    String? date,
    DateTime? from,
    DateTime? to,
    String? sort,
  }) =>
      AllReportsFilter(
        search: search ?? this.search,
        source: source ?? this.source,
        status: status ?? this.status,
        level: level ?? this.level,
        date: date ?? this.date,
        from: date != null && date != 'custom' ? null : from ?? this.from,
        to: date != null && date != 'custom' ? null : to ?? this.to,
        sort: sort ?? this.sort,
      );
}

/// Search text for an ilike inside or(). The value goes in double quotes, so
/// commas and parentheses are plain text there. % and _ are escaped for LIKE.
/// PostgREST turns every * into %, with no way to escape it, so a typed *
/// becomes _, which matches that one character.
String allReportsSearch(String text) {
  final like = text
      .trim()
      .replaceAll(r'\', r'\\')
      .replaceAll('%', r'\%')
      .replaceAll('_', r'\_')
      .replaceAll('*', '_');
  final quoted = '*$like*'.replaceAll(r'\', r'\\').replaceAll('"', r'\"');
  return ['location', 'description', 'reporter_name']
      .map((column) => '$column.ilike."$quoted"')
      .join(',');
}

const _manilaOffset = Duration(hours: 8);

/// The UTC start of a Manila calendar day.
DateTime _dayStart(int year, int month, int day) =>
    DateTime.utc(year, month, day).subtract(_manilaOffset);

/// Bounds on reported_at: [from] is included, [before] is not.
({DateTime? from, DateTime? before}) allReportsDates(
    AllReportsFilter filter, DateTime now) {
  final utc = now.toUtc();
  switch (filter.date) {
    case 'today':
      final manila = utc.add(_manilaOffset);
      return (
        from: _dayStart(manila.year, manila.month, manila.day),
        before: null,
      );
    case '7d':
      return (from: utc.subtract(const Duration(days: 7)), before: null);
    case '30d':
      return (from: utc.subtract(const Duration(days: 30)), before: null);
    case 'custom':
      final from = filter.from;
      final to = filter.to;
      return (
        from: from == null ? null : _dayStart(from.year, from.month, from.day),
        before: to == null ? null : _dayStart(to.year, to.month, to.day + 1),
      );
    default:
      return (from: null, before: null);
  }
}

const _levelRank = {'ankle': 1, 'knee': 2, 'waist': 3, 'chest': 4, 'overhead': 5};
const _statusRank = {'pending': 0, 'approved': 1, 'verified': 1, 'rejected': 2};

/// Sorts the rows already loaded, keeping the server order for ties. Rows
/// without a value go last.
List<AllReport> sortLoaded(List<AllReport> rows, String sort) {
  int Function(AllReport, AllReport)? compare;
  if (sort == 'highest') {
    compare = (a, b) =>
        (_levelRank[b.waterLevel] ?? 0) - (_levelRank[a.waterLevel] ?? 0);
  } else if (sort == 'lowest') {
    compare = (a, b) =>
        (_levelRank[a.waterLevel] ?? 99) - (_levelRank[b.waterLevel] ?? 99);
  } else if (sort == 'status') {
    compare = (a, b) =>
        (_statusRank[a.status] ?? 3) - (_statusRank[b.status] ?? 3);
  }
  final order = compare;
  if (order == null) return rows;
  // List.sort is not stable: the position breaks ties.
  final indexed = rows.indexed.toList()
    ..sort((a, b) {
      final result = order(a.$2, b.$2);
      return result != 0 ? result : a.$1 - b.$1;
    });
  return [for (final entry in indexed) entry.$2];
}

String sourceLabel(String? source) => switch (source) {
      'resident' => 'Resident',
      'mdrrmo' => 'MDRRMO',
      'guest' => 'Guest (Quick Report)',
      _ => 'Unknown (older report)',
    };

typedef AllReportsPage = ({List<AllReport> rows, int total});

class AllReportsService {
  static const pageSize = 25;
  static const _columns =
      'kind, id, source, barangay, location, lat, lng, water_level, '
      'description, status, reported_at, reporter_name, photo_path, '
      'photo_bucket, rejection_reason';

  SupabaseClient get _client => Supabase.instance.client;

  /// Community reports are readable by every signed-in user, so this always
  /// filters by barangay.
  Future<AllReportsPage> fetch({
    required String barangay,
    required AllReportsFilter filter,
    required int start,
    required int count,
  }) async {
    var query =
        _client.from('all_reports').select(_columns).eq('barangay', barangay);
    if (filter.search.trim().isNotEmpty) {
      query = query.or(allReportsSearch(filter.search));
    }
    if (filter.source != 'all') query = query.eq('source', filter.source);
    if (filter.status == 'approved') {
      query = query.inFilter('status', ['approved', 'verified']);
    } else if (filter.status != 'all') {
      query = query.eq('status', filter.status);
    }
    if (filter.level != 'all') query = query.eq('water_level', filter.level);
    final dates = allReportsDates(filter, DateTime.now());
    if (dates.from != null) {
      query = query.gte('reported_at', dates.from!.toIso8601String());
    }
    if (dates.before != null) {
      query = query.lt('reported_at', dates.before!.toIso8601String());
    }
    // kind and id keep the order fixed, so Load more never repeats a row.
    final response = await query
        .order('reported_at', ascending: filter.sort == 'oldest')
        .order('kind', ascending: true)
        .order('id', ascending: true)
        .range(start, start + count - 1)
        .count(CountOption.exact);
    return (
      rows: response.data.map<AllReport>(AllReport.fromRow).toList(),
      total: response.count,
    );
  }

  /// report-photos is public; quick-report-photos is private, so its URL is
  /// signed for 5 minutes.
  Future<String> photoUrl(AllReport report) async {
    final path = report.photoPath ?? '';
    if (report.photoBucket == 'quick-report-photos') {
      return _client.storage.from('quick-report-photos').createSignedUrl(path, 300);
    }
    return PostedReportsService.photoUrl(path);
  }
}
