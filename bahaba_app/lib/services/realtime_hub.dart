import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// One shared Supabase Realtime stream per table, reference-counted.
///
/// Every `.stream()` call opens its own Realtime channel, so repositories go
/// through [table] instead: the first listener opens the table's stream, the
/// last one to cancel closes it. Late listeners immediately get the latest
/// snapshot. Callers filter and sort rows themselves (row-level security
/// still applies server-side).
class RealtimeHub {
  RealtimeHub._();
  static final RealtimeHub instance = RealtimeHub._();

  final Map<String, _SharedTable> _tables = {};

  Stream<List<Map<String, dynamic>>> table(
    String name, {
    List<String> primaryKey = const ['id'],
  }) {
    return _tables
        .putIfAbsent(name, () => _SharedTable(name, primaryKey))
        .stream;
  }
}

class _SharedTable {
  _SharedTable(this.name, this.primaryKey);

  final String name;
  final List<String> primaryKey;
  final Set<MultiStreamController<List<Map<String, dynamic>>>> _listeners = {};
  StreamSubscription<List<Map<String, dynamic>>>? _sub;
  List<Map<String, dynamic>>? _latest;

  Stream<List<Map<String, dynamic>>> get stream => Stream.multi((listener) {
        _listeners.add(listener);
        final latest = _latest;
        if (latest != null) listener.add(latest);

        _sub ??= Supabase.instance.client
            .from(name)
            .stream(primaryKey: primaryKey)
            .listen(
          (rows) {
            _latest = rows;
            for (final l in _listeners.toList()) {
              l.add(rows);
            }
          },
          onError: (Object error, StackTrace stack) {
            for (final l in _listeners.toList()) {
              l.addError(error, stack);
            }
          },
          // supabase closes the stream (and its channel) when the initial
          // query fails; drop it so the next listener opens a fresh one.
          onDone: () {
            _sub = null;
            _latest = null;
            _logChannelCount('$name stream ended');
          },
        );
        _logChannelCount('opened $name');

        listener.onCancel = () {
          _listeners.remove(listener);
          if (_listeners.isEmpty) {
            // Last listener gone: close the channel and drop the cache.
            final sub = _sub;
            _sub = null;
            _latest = null;
            final cancelled = sub?.cancel();
            // The channel leaves asynchronously; count once it has gone.
            Future<void>.delayed(const Duration(seconds: 1),
                () => _logChannelCount('closed $name'));
            return cancelled;
          }
          return null;
        };
      });
}

/// Debug builds only: how many Realtime channels the client holds
/// (target: 3-5 per signed-in user).
void _logChannelCount(String reason) {
  if (!kDebugMode) return;
  final count = Supabase.instance.client.getChannels().length;
  debugPrint('[realtime] $reason -> $count active channel(s)');
}
