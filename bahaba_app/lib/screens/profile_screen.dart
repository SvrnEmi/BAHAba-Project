import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide User;
import 'package:url_launcher/url_launcher.dart';

import '../config/emergency_contacts.dart';
import '../models/community_report_model.dart';
import '../models/user_model.dart';
import '../providers/app_state.dart';
import '../repositories/profile_repository.dart';
import '../theme/app_theme.dart';
import '../utils/navigation.dart';
import '../utils/report_display.dart';
import '../widgets/clay_button.dart';
import '../widgets/clay_container.dart';
import '../widgets/flat_status_card.dart';
import '../widgets/profile_avatar_button.dart';
import '../widgets/report_messages_section.dart';
import '../widgets/report_status_badge.dart';
import '../widgets/risk_badge.dart';
import '../widgets/brand_logo.dart';

/// Collapsible sections of the Profile screen. Pass one as
/// [ProfileScreen.initialSection] to open it straight away (deep link).
enum ProfileSection { details, barangay, reports, notifications, password }

class _Message {
  final bool isError;
  final String text;
  const _Message.ok(this.text) : isError = false;
  const _Message.error(this.text) : isError = true;
}

/// Sections report save results here: shown inline; errors also open it.
typedef _Report = void Function(_Message message);

/// Profile for every role. Header and emergency calls are always visible;
/// everything else is an accordion (one section open at a time).
class ProfileScreen extends StatefulWidget {
  final ProfileSection? initialSection;

  const ProfileScreen({super.key, this.initialSection});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _repo = ProfileRepository();
  late ProfileSection? _open = widget.initialSection;
  final Map<ProfileSection, _Message> _messages = {};
  NotificationPrefs? _prefs;
  ({int total, int pending})? _reportCounts;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
    _loadReportCounts();
  }

  Future<void> _loadPrefs() async {
    try {
      final prefs = await _repo.fetchNotificationPrefs();
      if (mounted) setState(() => _prefs = prefs);
    } catch (error) {
      debugPrint('Notification prefs failed: $error');
      if (mounted) setState(() => _prefs = NotificationPrefs.defaults);
    }
  }

  /// Summary counts only; the report list loads when the section opens.
  Future<void> _loadReportCounts() async {
    final user = context.read<AppState>().currentUser;
    if (user == null || user.role != UserRole.resident) return;
    try {
      final results = await Future.wait([
        _repo.countMyReports(name: user.fullName, email: user.email),
        _repo.countMyReports(
            name: user.fullName, email: user.email, pendingOnly: true),
      ]);
      if (mounted) {
        setState(
            () => _reportCounts = (total: results[0], pending: results[1]));
      }
    } catch (error) {
      debugPrint('Report counts failed: $error');
    }
  }

  void _toggle(ProfileSection section) =>
      setState(() => _open = _open == section ? null : section);

  _Report _reporter(ProfileSection section) => (message) {
        if (!mounted) return;
        setState(() {
          _messages[section] = message;
          if (message.isError) _open = section;
        });
      };

  String? get _reportsSummary {
    final counts = _reportCounts;
    if (counts == null) return null;
    final noun = counts.total == 1 ? 'report' : 'reports';
    final pending = counts.pending > 0 ? ' - ${counts.pending} pending' : '';
    return '${counts.total} $noun$pending';
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppState>().currentUser;
    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('Please sign in to view your profile.')),
      );
    }
    final isResident = user.role == UserRole.resident;
    final prefs = _prefs;

    _AccordionSection section(
      ProfileSection id, {
      required IconData icon,
      required String title,
      String? summary,
      required Widget child,
    }) {
      return _AccordionSection(
        icon: icon,
        title: title,
        summary: summary,
        open: _open == id,
        onToggle: () => _toggle(id),
        child: child,
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const BrandAppBarTitle(child: Text('Profile'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
        children: [
          _ProfileHeader(user: user),
          const SizedBox(height: 14),
          _EmergencyButtons(barangay: user.barangay),
          const SizedBox(height: 18),
          section(
            ProfileSection.details,
            icon: Icons.person_outline,
            title: 'Edit details',
            summary: user.phone.trim().isEmpty ? 'Add phone' : user.phone,
            child: _EditDetails(
              user: user,
              message: _messages[ProfileSection.details],
              report: _reporter(ProfileSection.details),
            ),
          ),
          if (isResident) ...[
            const SizedBox(height: 12),
            section(
              ProfileSection.barangay,
              icon: Icons.location_on_outlined,
              title: 'My barangay',
              summary:
                  (user.barangay ?? '').isEmpty ? 'Not set' : user.barangay,
              child: _MyBarangay(
                user: user,
                message: _messages[ProfileSection.barangay],
                report: _reporter(ProfileSection.barangay),
              ),
            ),
            const SizedBox(height: 12),
            section(
              ProfileSection.reports,
              icon: Icons.description_outlined,
              title: 'My reports',
              summary: _reportsSummary,
              child: _MyReports(
                user: user,
                active: _open == ProfileSection.reports,
                onLoaded: (reports) => setState(() => _reportCounts = (
                      total: reports.length,
                      pending: reports
                          .where((r) => r.status == ReportStatus.pending)
                          .length,
                    )),
              ),
            ),
          ],
          const SizedBox(height: 12),
          section(
            ProfileSection.notifications,
            icon: Icons.notifications_outlined,
            title: 'Notification settings',
            summary:
                prefs == null ? null : (prefs.push ? 'Push on' : 'Push off'),
            child: prefs == null
                ? const Text('Loading settings...',
                    style: TextStyle(color: AppColors.textSecondary))
                : _NotificationSettings(
                    initial: prefs,
                    message: _messages[ProfileSection.notifications],
                    report: _reporter(ProfileSection.notifications),
                    onSaved: (saved) => setState(() => _prefs = saved),
                  ),
          ),
          const SizedBox(height: 12),
          section(
            ProfileSection.password,
            icon: Icons.lock_outline,
            title: 'Change password',
            child: _ChangePassword(
              message: _messages[ProfileSection.password],
              report: _reporter(ProfileSection.password),
            ),
          ),
          const SizedBox(height: 24),
          const _LogoutButton(),
        ],
      ),
    );
  }
}

String _errorText(Object error, String fallback) {
  if (error is PostgrestException) return error.message;
  if (error is AuthException) return error.message;
  return fallback;
}

String _roleLabel(UserRole role) {
  switch (role) {
    case UserRole.barangay:
      return 'Barangay Admin';
    case UserRole.mdrrmo:
      return 'MDRRMO';
    case UserRole.resident:
      return 'Resident';
  }
}

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

/// Clay card with a tappable header (icon, title, summary, rotating chevron)
/// and an animated body. The body stays in the tree while collapsed so
/// unsaved input survives, but is hidden from focus, taps and screen readers.
class _AccordionSection extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? summary;
  final bool open;
  final VoidCallback onToggle;
  final Widget child;

  const _AccordionSection({
    required this.icon,
    required this.title,
    required this.summary,
    required this.open,
    required this.onToggle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final duration =
        reduceMotion ? Duration.zero : const Duration(milliseconds: 200);

    return ClayContainer(
      borderRadius: 22,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: open,
            label: summary == null ? title : '$title, $summary',
            excludeSemantics: true,
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                onTap: onToggle,
                borderRadius: BorderRadius.circular(22),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 56),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Icon(icon, size: 20, color: AppColors.primary),
                        const SizedBox(width: 10),
                        Text(title, style: AppText.heading(size: 15)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            summary ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.right,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        AnimatedRotation(
                          turns: open ? 0.5 : 0,
                          duration: duration,
                          child: const Icon(Icons.expand_more,
                              color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          ClipRect(
            child: AnimatedAlign(
              alignment: Alignment.topCenter,
              heightFactor: open ? 1 : 0,
              duration: duration,
              curve: Curves.easeOut,
              child: ExcludeSemantics(
                excluding: !open,
                child: ExcludeFocus(
                  excluding: !open,
                  child: IgnorePointer(
                    ignoring: !open,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: child,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineMessage extends StatelessWidget {
  final _Message? message;
  const _InlineMessage(this.message);

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Semantics(
        liveRegion: true,
        child: FlatStatusCard(
          accent: m.isError ? AppColors.riskHigh : AppColors.riskLow,
          padding: const EdgeInsets.all(10),
          child: Text(m.text, style: const TextStyle(fontSize: 13)),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header + emergency buttons (always visible)
// ---------------------------------------------------------------------------

class _ProfileHeader extends StatelessWidget {
  final User user;
  const _ProfileHeader({required this.user});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.lavender,
              shape: BoxShape.circle,
            ),
            child: Text(
              profileInitials(user.fullName),
              style: AppText.heading(size: 22, color: AppColors.lavenderIcon),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.fullName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.heading(size: 18),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SolidBadge(
                      label: _roleLabel(user.role),
                      color: AppColors.info,
                      compact: true,
                    ),
                    if ((user.barangay ?? '').isNotEmpty)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.location_on_outlined,
                              size: 14, color: AppColors.textSecondary),
                          const SizedBox(width: 2),
                          Text(
                            user.barangay!,
                            style: const TextStyle(
                                fontSize: 12, color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Always visible, one tap away. A hotline without a configured number is
/// shown disabled; the Barangay Hall button appears once its number is set.
class _EmergencyButtons extends StatelessWidget {
  final String? barangay;
  const _EmergencyButtons({required this.barangay});

  Future<void> _call(BuildContext context, String number) async {
    final ok = await launchUrl(Uri(scheme: 'tel', path: number));
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open the phone app. Dial $number.')),
      );
    }
  }

  Widget _button(BuildContext context, String label, String? number) {
    return Semantics(
      label:
          number == null ? '$label, hotline not set yet' : '$label at $number',
      button: true,
      excludeSemantics: true,
      child: ClayButton(
        label: label,
        icon: Icons.call,
        onPressed: number == null ? null : () => _call(context, number),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const mdrrmo = EmergencyContacts.mdrrmoOdiongan;
    final hall = EmergencyContacts.barangayHall(barangay);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Full-width rows so the labels never truncate on small phones.
        _button(context, 'Call MDRRMO Odiongan', mdrrmo),
        const SizedBox(height: 10),
        _button(context, 'Call 911', EmergencyContacts.nationalEmergency),
        if (hall != null) ...[
          const SizedBox(height: 10),
          _button(context, 'Call Barangay $barangay Hall', hall),
        ],
        if (mdrrmo == null)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              'MDRRMO hotline not set yet.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Edit details
// ---------------------------------------------------------------------------

class _EditDetails extends StatefulWidget {
  final User user;
  final _Message? message;
  final _Report report;

  const _EditDetails({
    required this.user,
    required this.message,
    required this.report,
  });

  @override
  State<_EditDetails> createState() => _EditDetailsState();
}

class _EditDetailsState extends State<_EditDetails> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name =
      TextEditingController(text: widget.user.fullName);
  late final TextEditingController _phone =
      TextEditingController(text: widget.user.phone);
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final name = _name.text.trim();
    final phone = _phone.text.trim();
    try {
      // Only name and phone: never role or email.
      await ProfileRepository().updateDetails(name: name, phone: phone);
      if (!mounted) return;
      context
          .read<AppState>()
          .applyProfileChanges(fullName: name, phone: phone);
      widget.report(const _Message.ok('Your details were saved.'));
    } catch (error) {
      widget.report(
          _Message.error(_errorText(error, 'Unable to save your details.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Name'),
            validator: (v) => (v == null || v.trim().isEmpty)
                ? 'Please enter your name.'
                : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone',
              hintText: '09XXXXXXXXX',
            ),
            validator: (v) =>
                RegExp(r'^[0-9+\-]{7,15}$').hasMatch((v ?? '').trim())
                    ? null
                    : 'Use 7-15 characters: digits, + or - only.',
          ),
          const SizedBox(height: 14),
          TextFormField(
            initialValue: widget.user.email,
            readOnly: true,
            enabled: false,
            decoration: const InputDecoration(
              labelText: 'Email (cannot be changed here)',
            ),
          ),
          const SizedBox(height: 16),
          ClayButton(
            label: _saving ? 'Saving...' : 'Save details',
            onPressed: _saving ? null : _save,
          ),
          _InlineMessage(widget.message),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// My barangay (residents)
// ---------------------------------------------------------------------------

class _MyBarangay extends StatefulWidget {
  final User user;
  final _Message? message;
  final _Report report;

  const _MyBarangay({
    required this.user,
    required this.message,
    required this.report,
  });

  @override
  State<_MyBarangay> createState() => _MyBarangayState();
}

class _MyBarangayState extends State<_MyBarangay> {
  List<String>? _options;
  bool _failed = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final names = await ProfileRepository().fetchBarangayNames();
      if (mounted) setState(() => _options = names);
    } catch (error) {
      debugPrint('Barangay list failed: $error');
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _change(String? next) async {
    if (next == null || next == widget.user.barangay) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change barangay?'),
        content: const Text(
          'Changing your barangay changes which alerts and flood levels you '
          'see. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _saving = true);
    try {
      await ProfileRepository().updateBarangay(next);
      if (!mounted) return;
      context.read<AppState>().applyProfileChanges(barangay: next);
      widget.report(_Message.ok('Your barangay is now $next.'));
    } catch (error) {
      widget.report(
          _Message.error(_errorText(error, 'Unable to change your barangay.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = widget.user.barangay;
    Widget body;
    if (_failed) {
      body = const Text(
        'Unable to load the barangay list right now.',
        style: TextStyle(color: AppColors.textSecondary),
      );
    } else if (_options == null) {
      body = const Text(
        'Loading barangays...',
        style: TextStyle(color: AppColors.textSecondary),
      );
    } else {
      final options = {
        ..._options!,
        if (current != null && current.isNotEmpty) current,
      }.toList()
        ..sort();
      body = DropdownButtonFormField<String>(
        // Rebuilt with the saved value after a successful change.
        key: ValueKey(current),
        initialValue: (current ?? '').isEmpty ? null : current,
        isExpanded: true,
        borderRadius: BorderRadius.circular(20),
        decoration: const InputDecoration(labelText: 'Barangay'),
        items: [
          for (final name in options)
            DropdownMenuItem(value: name, child: Text(name)),
        ],
        onChanged: _saving ? null : _change,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [body, _InlineMessage(widget.message)],
    );
  }
}

// ---------------------------------------------------------------------------
// My reports (residents, lazy)
// ---------------------------------------------------------------------------

/// Loads only once the section is first opened ([active]). One-shot read,
/// no realtime.
class _MyReports extends StatefulWidget {
  final User user;
  final bool active;
  final ValueChanged<List<CommunityReport>> onLoaded;

  const _MyReports({
    required this.user,
    required this.active,
    required this.onLoaded,
  });

  @override
  State<_MyReports> createState() => _MyReportsState();
}

class _MyReportsState extends State<_MyReports> {
  bool _requested = false;
  List<CommunityReport>? _reports;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    if (widget.active) _load();
  }

  @override
  void didUpdateWidget(covariant _MyReports oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_requested) _load();
  }

  Future<void> _load() async {
    _requested = true;
    try {
      final reports = await ProfileRepository().fetchMyReports(
        name: widget.user.fullName,
        email: widget.user.email,
      );
      if (!mounted) return;
      setState(() => _reports = reports);
      widget.onLoaded(reports);
    } catch (error) {
      debugPrint('My reports failed: $error');
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return const Text('Unable to load your reports right now.',
          style: TextStyle(color: AppColors.textSecondary));
    }
    final reports = _reports;
    if (reports == null) {
      return const Text('Loading your reports...',
          style: TextStyle(color: AppColors.textSecondary));
    }
    if (reports.isEmpty) {
      return const Text('You have not submitted any reports yet.',
          style: TextStyle(color: AppColors.textSecondary));
    }
    return Column(
      children: [
        for (final report in reports)
          Padding(
            key: ValueKey(report.id),
            padding: const EdgeInsets.only(bottom: 10),
            child: _MyReportItem(report: report),
          ),
      ],
    );
  }
}

class _MyReportItem extends StatelessWidget {
  final CommunityReport report;
  const _MyReportItem({required this.report});

  @override
  Widget build(BuildContext context) {
    final reason = report.rejectionReason?.trim() ?? '';
    return FlatPanel(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${waterLevelLabel(report.waterLevel)} - ${report.location}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      relativeTime(report.timestamp),
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ReportStatusBadge(status: report.status.value),
            ],
          ),
          if (report.status == ReportStatus.rejected && reason.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Reason: $reason',
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary),
              ),
            ),
          if (report.id != null)
            // The thread also shows the old single reply as its first message.
            ReportMessagesSection(
              reportId: report.id!,
              legacyReply: report.adminReply,
              legacyReplyAt: report.adminReplyAt,
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Notification settings
// ---------------------------------------------------------------------------

class _NotificationSettings extends StatefulWidget {
  final NotificationPrefs initial;
  final _Message? message;
  final _Report report;
  final ValueChanged<NotificationPrefs> onSaved;

  const _NotificationSettings({
    required this.initial,
    required this.message,
    required this.report,
    required this.onSaved,
  });

  @override
  State<_NotificationSettings> createState() => _NotificationSettingsState();
}

class _NotificationSettingsState extends State<_NotificationSettings>
    with WidgetsBindingObserver {
  late NotificationPrefs _prefs = widget.initial;
  bool _saving = false;
  bool _osDenied = false;

  static const _labels = {
    'advisory': 'Advisory',
    'warning': 'Warning',
    'critical': 'Critical',
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkOsPermission();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The user may have changed the permission in system settings.
    if (state == AppLifecycleState.resumed) _checkOsPermission();
  }

  Future<void> _checkOsPermission() async {
    try {
      final status = await Permission.notification.status;
      if (mounted) {
        setState(() => _osDenied = status.isDenied ||
            status.isPermanentlyDenied ||
            status.isRestricted);
      }
    } catch (error) {
      debugPrint('Notification permission check failed: $error');
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ProfileRepository().saveNotificationPrefs(_prefs);
      widget.onSaved(_prefs);
      widget.report(const _Message.ok('Notification settings saved.'));
    } catch (error) {
      widget.report(_Message.error(
          _errorText(error, 'Unable to save notification settings.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = _prefs;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_osDenied)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: FlatStatusCard(
              accent: AppColors.riskMedium,
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Notifications are turned off for BAHAba in your phone '
                    'settings, so you will not get flood alerts.',
                    style: TextStyle(fontSize: 13),
                  ),
                  TextButton.icon(
                    onPressed: openAppSettings,
                    icon: const Icon(Icons.settings_outlined, size: 18),
                    label: const Text('Open settings'),
                  ),
                ],
              ),
            ),
          ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Push notifications'),
          value: prefs.push,
          onChanged: (v) => setState(() => _prefs = prefs.copyWith(push: v)),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 4, bottom: 2),
          child: Text(
            'Alert levels',
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.ink),
          ),
        ),
        for (final level in NotificationPrefs.allLevels)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(_labels[level]!),
            subtitle: level == 'critical'
                ? const Row(
                    children: [
                      Icon(Icons.lock_outline,
                          size: 14, color: AppColors.textSecondary),
                      SizedBox(width: 4),
                      Text('Always on'),
                    ],
                  )
                : null,
            value: level == 'critical' || prefs.levels.contains(level),
            onChanged: level == 'critical'
                ? null
                : (checked) {
                    final next = {...prefs.levels};
                    if (checked == true) {
                      next.add(level);
                    } else {
                      next.remove(level);
                    }
                    setState(() => _prefs = prefs.copyWith(levels: next));
                  },
          ),
        const SizedBox(height: 8),
        ClayButton.secondary(
          label: _saving ? 'Saving...' : 'Save notification settings',
          onPressed: _saving ? null : _save,
        ),
        _InlineMessage(widget.message),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

class _ChangePassword extends StatefulWidget {
  final _Message? message;
  final _Report report;

  const _ChangePassword({required this.message, required this.report});

  @override
  State<_ChangePassword> createState() => _ChangePasswordState();
}

class _ChangePasswordState extends State<_ChangePassword> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _saving = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ProfileRepository().changePassword(_password.text);
      if (!mounted) return;
      _password.clear();
      _confirm.clear();
      widget.report(const _Message.ok('Your password was changed.'));
    } on ReauthenticationRequired {
      widget.report(const _Message.error(
        'For your security, please log out and log in again, then change '
        'your password.',
      ));
    } catch (error) {
      widget.report(
          _Message.error(_errorText(error, 'Unable to change your password.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            decoration: InputDecoration(
              labelText: 'New password',
              suffixIcon: IconButton(
                tooltip: _obscure ? 'Show password' : 'Hide password',
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (v) => (v ?? '').length < 8
                ? 'Password must be at least 8 characters.'
                : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _confirm,
            obscureText: _obscure,
            decoration:
                const InputDecoration(labelText: 'Confirm new password'),
            validator: (v) =>
                v != _password.text ? 'Passwords do not match.' : null,
          ),
          const SizedBox(height: 16),
          ClayButton.secondary(
            label: _saving ? 'Updating...' : 'Update password',
            onPressed: _saving ? null : _save,
          ),
          _InlineMessage(widget.message),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Logout (outside the accordion)
// ---------------------------------------------------------------------------

class _LogoutButton extends StatefulWidget {
  const _LogoutButton();

  @override
  State<_LogoutButton> createState() => _LogoutButtonState();
}

class _LogoutButtonState extends State<_LogoutButton> {
  bool _busy = false;

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out?'),
        content: const Text('You will need to sign in again to use BAHAba.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    // Existing cleanup: removes this device's push token, then signs out.
    await context.read<AppState>().logout();
    if (mounted) AppNavigator.goToWelcome(context);
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: _busy ? null : _logout,
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.riskHigh,
        iconColor: AppColors.riskHigh,
        backgroundBuilder:
            ClayButtonSurface.secondary(borderColor: AppColors.riskHigh),
      ),
      icon: const Icon(Icons.logout),
      label: Text(_busy ? 'Logging out...' : 'Log out'),
    );
  }
}
