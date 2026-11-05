/// Text for the resident and guest screens, kept together so it can be
/// translated later. Add new resident or guest text here, not in a widget.
/// src/lib/strings.ts in the web app holds the same text.
class AppStrings {
  AppStrings._();

  // Navigation
  static const navHome = 'Home';
  static const navAlerts = 'Alerts';
  static const navReports = 'Reports';
  static const navMap = 'Map';

  // Alerts
  static const alertsTitle = 'Alerts & Notifications';
  static const alertsSubtitle = 'Stay informed about flood risks';
  static const alertsSection = 'Flood Alerts';
  static const alertsFromYours = 'From your barangay and the MDRRMO';
  static String alertsFrom(String barangay) => 'From $barangay and the MDRRMO';
  static const alertsViewAll = 'View all';
  static const alertsChecking = 'Checking for alerts...';
  static const alertsLoadFailed =
      'Could not load alerts. Pull down to try again.';
  static const alertsNone = 'No alerts for your barangay right now';
  static const alertsListLabel = 'Flood alerts';
  static const alertAllClear = 'All clear';
  static const alertEnded = 'Ended';
  static const alertEnds = 'Ends';
  static const alertLatest = 'Latest alert';
  static const alertCurrent = 'Current alert';
  static String alertMore(int count) => '+$count more';

  // Reported on the ground
  static const groundTitle = 'Reported on the ground';
  static String groundSubtitle(String barangay) =>
      'From officials in $barangay';
  static const groundChecking = 'Checking reports...';
  static const groundLoadFailed =
      'Could not load the reports. Check your connection.';
  static const groundRetry = 'Try again';
  static const groundNone = 'No on-the-ground reports from your barangay yet.';
  static String groundNoneFor(String barangay) =>
      'No on-the-ground reports from $barangay yet.';
  static const groundOutOfDate = 'may be out of date';

  static String groundKind(String kind) => switch (kind) {
        'waterway' => 'Waterway',
        'road' => 'Road',
        _ => kind,
      };

  static String groundStatus(String status) => switch (status) {
        'normal' => 'Normal',
        'rising' => 'Rising',
        'overflowing' => 'Overflowing',
        'passable' => 'Passable',
        'impassable' => 'Not passable',
        _ => status,
      };

  /// "just now", "5 minutes ago", "2 hours ago", "3 days ago".
  static String timeAgo(DateTime time, DateTime now) {
    final diff = now.difference(time);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) {
      return '${diff.inMinutes} ${diff.inMinutes == 1 ? 'minute' : 'minutes'} ago';
    }
    if (diff.inHours < 24) {
      return '${diff.inHours} ${diff.inHours == 1 ? 'hour' : 'hours'} ago';
    }
    return '${diff.inDays} ${diff.inDays == 1 ? 'day' : 'days'} ago';
  }

  // Posted reports
  static const postedTitle = 'Posted reports';
  static const postedDetailTitle = 'Flood report';
  static const postedChecking = 'Checking reports...';
  static const postedLoadFailed =
      'Could not load the reports. Check your connection.';
  static const postedRetry = 'Try again';
  static const postedNone = 'No verified reports in your barangay yet.';
  static String postedBy(String barangay) =>
      'Reported by a resident of $barangay';
  static String postedOpen(String location, String level, String when) =>
      '$location, $level, $when. Open the full report.';
  static const postedUnknownLocation = 'Unknown location';
  static const postedMissing = 'This report is no longer posted.';
  static const postedPhotoAlt = 'Flood report photo';
  static const postedPhotoUnavailable = 'Photo unavailable';

  // Report pop-ups
  static String popupVerified(String barangay) =>
      'A flood report was verified in $barangay';
  static const popupOwn = 'Your report was verified and is now posted.';
  static const popupRejected = 'Your report was not accepted';
  static String popupMany(int count, String barangay) =>
      '$count new verified ${count == 1 ? 'report' : 'reports'} in $barangay';
  static String popupUpdates(int count) => '$count report updates';
  static const popupOwnTag = 'Your report';
  static const popupReason = 'Reason:';
  static const popupNoReason = 'No reason was given.';
  static const popupViewReport = 'View report';
  static const popupView = 'View';
  static const popupDismiss = 'Dismiss';

  // Guests
  static const guestPickBarangay = 'Barangay';
  static const guestChoose = 'Choose a barangay';
  static const guestConditionsTitle = 'Conditions on the ground';
  static const guestConditionsSubtitle =
      'Pick a barangay to see what officials report';
  static const guestConditionsButton = 'Conditions on the ground';
}
