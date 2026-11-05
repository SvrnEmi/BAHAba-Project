import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_strings.dart';
import '../providers/app_state.dart';
import '../repositories/barangay_repository.dart';
import '../services/emergency_contacts_service.dart';
import '../theme/app_theme.dart';
import '../widgets/clay_container.dart';
import '../widgets/hotline_buttons.dart';
import '../widgets/screen_header.dart';

/// Municipal contacts first, then one barangay's. Contacts come only from the
/// database. Residents see their own barangay (a tab in the main shell);
/// guests pick one ([guest] adds the app bar and the barangay picker).
class EmergencyContactsScreen extends StatefulWidget {
  final bool guest;

  /// Replaces the Supabase read in tests.
  final Future<List<EmergencyContact>> Function(String? barangay)? read;

  const EmergencyContactsScreen({super.key, this.guest = false, this.read});

  @override
  State<EmergencyContactsScreen> createState() =>
      _EmergencyContactsScreenState();
}

class _EmergencyContactsScreenState extends State<EmergencyContactsScreen> {
  List<String> _barangays = BarangayRepository.currentNames;
  String? _picked;
  String? _loadedFor;
  bool _started = false;
  List<EmergencyContact> _rows = const [];
  bool _loading = true;
  bool _failed = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    if (widget.guest) {
      BarangayRepository.names().then((names) {
        if (mounted) setState(() => _barangays = names);
      });
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final barangay = _barangay;
    if (!_started || barangay != _loadedFor) _load(barangay);
  }

  String? get _barangay => widget.guest
      ? _picked
      : context.read<AppState>().currentUser?.barangay;

  Future<void> _load(String? barangay) async {
    _started = true;
    _loadedFor = barangay;
    final generation = ++_generation;
    if (mounted) {
      setState(() {
        _loading = true;
        _failed = false;
      });
    }
    try {
      final rows =
          await (widget.read ?? EmergencyContactsService.fetch)(barangay);
      if (!mounted || generation != _generation) return;
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } catch (e) {
      debugPrint('Emergency contacts unavailable: $e');
      if (!mounted || generation != _generation) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  Widget _body() {
    final municipal = _rows.where((c) => c.barangay == null).toList();
    final local = _rows.where((c) => c.barangay != null).toList();
    final barangay = _loadedFor ?? '';

    return RefreshIndicator(
      onRefresh: () => _load(_loadedFor),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
        children: [
          if (widget.guest) ...[
            DropdownButtonFormField<String?>(
              key: const ValueKey('contacts-barangay'),
              initialValue: _picked,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: AppStrings.guestPickBarangay,
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text(AppStrings.guestMunicipalOnly),
                ),
                for (final name in _barangays)
                  DropdownMenuItem<String?>(value: name, child: Text(name)),
              ],
              onChanged: (value) {
                setState(() => _picked = value);
                _load(value);
              },
            ),
            const SizedBox(height: 16),
          ],
          if (_failed) ...[
            const Text(AppStrings.contactsLoadFailed,
                style: TextStyle(color: AppColors.ink, fontSize: 14)),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => _load(_loadedFor),
                child: const Text(AppStrings.contactsRetry),
              ),
            ),
          ] else if (_loading && _rows.isEmpty)
            const Text(AppStrings.contactsChecking,
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14))
          else if (_rows.isEmpty) ...[
            const ClayContainer(
              padding: EdgeInsets.all(20),
              child: Text(
                AppStrings.contactsEmpty,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.ink, fontSize: 14),
              ),
            ),
            const SizedBox(height: 16),
            const HotlineButtons(),
          ] else ...[
            if (municipal.isNotEmpty)
              _ContactSection(
                title: AppStrings.contactsMunicipal,
                rows: municipal,
              ),
            if (local.isNotEmpty)
              _ContactSection(
                title: AppStrings.contactsBarangay(barangay),
                rows: local,
              ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Rebuilds and reloads if a resident's barangay changes in Profile.
    if (!widget.guest) context.watch<AppState>();

    if (widget.guest) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text(AppStrings.contactsTitle)),
        body: _body(),
      );
    }
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: AppStrings.contactsTitle,
            subtitle: AppStrings.contactsSubtitle,
            icon: Icons.phone_outlined,
            chipColor: AppColors.peach,
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }
}

class _ContactSection extends StatelessWidget {
  final String title;
  final List<EmergencyContact> rows;

  const _ContactSection({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: AppText.heading(size: 16)),
        ),
        const SizedBox(height: 8),
        for (final contact in rows) ContactTile(contact: contact),
        const SizedBox(height: 12),
      ],
    );
  }
}

class ContactTile extends StatelessWidget {
  final EmergencyContact contact;

  const ContactTile({super.key, required this.contact});

  Future<void> _call(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    var opened = false;
    try {
      opened = await launchUrl(Uri(scheme: 'tel', path: contact.dialNumber));
    } catch (e) {
      debugPrint('Could not open dialer: $e');
    }
    if (!opened) {
      messenger.showSnackBar(
        SnackBar(content: Text(AppStrings.contactsDialFailed(contact.phone))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            contact.name,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (contact.role != null)
            Text(
              contact.role!,
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 13),
            ),
          Semantics(
            button: true,
            label: AppStrings.contactsCall(contact.name, contact.phone),
            excludeSemantics: true,
            child: TextButton.icon(
              onPressed: () => _call(context),
              icon: const Icon(Icons.phone, size: 18),
              label: Text(
                contact.phone,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
