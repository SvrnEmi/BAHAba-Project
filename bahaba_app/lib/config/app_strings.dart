import '../services/quick_report_service.dart';

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
  static const navContacts = 'Emergency Contacts';

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

  // Emergency contacts
  static const contactsTitle = 'Emergency Contacts';
  static const contactsSubtitle = 'Tap a number to call';
  static const contactsMunicipal = 'Municipal contacts';
  static String contactsBarangay(String barangay) => '$barangay contacts';
  static const contactsChecking = 'Loading contacts...';
  static const contactsLoadFailed =
      'Could not load the contacts. Check your connection.';
  static const contactsRetry = 'Try again';
  static const contactsEmpty =
      'No contacts have been added yet. Call the MDRRMO at ${QuickReportService.mdrrmoHotlineLabel}.';
  static String contactsCall(String name, String phone) =>
      'Call $name at $phone';
  static String contactsDialFailed(String phone) =>
      'Could not open the phone app. Please dial $phone.';

  // Guests
  static const guestPickBarangay = 'Barangay';
  static const guestChoose = 'Choose a barangay';
  static const guestMunicipalOnly = 'Municipal contacts only';
  static const guestConditionsTitle = 'Conditions on the ground';
  static const guestConditionsSubtitle =
      'Pick a barangay to see what officials report';
  static const guestConditionsButton = 'Conditions on the ground';
  static const guestContactsButton = 'Emergency Contacts';
}
