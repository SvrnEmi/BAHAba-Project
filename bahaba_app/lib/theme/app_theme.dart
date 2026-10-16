import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../widgets/clay_button.dart';
import 'clay_input_border.dart';

/// Central design tokens (claymorphism pass).
///
/// Contrast notes (WCAG AA, 4.5:1 for text under 18.66px bold / 24px):
/// - White on the mockup button gradient is only 2.9:1 at the light end
///   (0xFF5A9FDC) and 4.1:1 at the dark end (0xFF3B82C4).
/// - White on [riskLow] (0xFF2E8B57) is 4.3:1.
/// While [strictContrast] is true, fills that carry white text use the
/// AA-safe variants below instead. Set it to false for mockup-exact colors.
/// - [riskMedium] always takes dark [ink] text (5.4:1); white would be 2.7:1.
/// - [primary] as text on light surfaces is 3.6:1, so blue text uses
///   [primaryShade]. [primary] is fine for icons (3:1 rule for graphics).
class AppColors {
  static const bool strictContrast = true;

  // Surfaces
  static const Color background = Color(0xFFEAF1F8);
  static const Color clayLight = Color(0xFFFBFDFF);
  static const Color clayDark = Color(0xFFE8EFF8);
  static const Color surface = Color(0xFFF2F6FB);
  static const Color card = surface;

  /// Input fill: a shade below the clay card so fields read as pressed in.
  static const Color field = Color(0xFFEFF4FA);

  /// Flat white for safety-critical UI (alerts, badges). Never clay.
  static const Color flat = Colors.white;
  static const Color border = Color(0xFFD3DEEA);

  // Clay lighting
  static const Color clayShade = Color(0x617692B8); // 0xFF7692B8 @ 38%
  static const Color clayHighlight = Color(0xF2FFFFFF); // white @ 95%

  // Brand
  static const Color primary = Color(0xFF3B82C4);
  static const Color primaryLight = Color(0xFF5A9FDC);
  static const Color primaryShade = Color(0xFF2A62A0);

  /// [primary] nudged toward [primaryShade] so white labels pass AA (4.7:1).
  static const Color primaryStrong = Color(0xFF3577B7);

  /// Latest-report card on Home. White on the sketch teal 0xFF0A93AE is
  /// 3.6:1, so strict mode uses a darker teal (5.0:1).
  static const Color reportTeal =
      strictContrast ? Color(0xFF087A90) : Color(0xFF0A93AE);

  /// Selected bottom-nav well.
  static const Color navWell = Color(0xFFDCE8F5);

  // Decorative icon chips: pastel fill + matching dark icon (all > 6:1).
  static const Color peach = Color(0xFFFFD9C7);
  static const Color peachIcon = Color(0xFF9A4A24);
  static const Color mint = Color(0xFFCDEFE0);
  static const Color mintIcon = Color(0xFF1F6B4C);
  static const Color lavender = Color(0xFFDCD6F7);
  static const Color lavenderIcon = Color(0xFF4C3FA8);

  // Text
  static const Color ink = Color(0xFF1E2A38);
  static const Color textSecondary = Color(0xFF55657A);

  // Risk: solid, high contrast, never pastel, never clay.
  static const Color riskLow = Color(0xFF2E8B57);
  static const Color riskMedium = Color(0xFFD98E04);
  static const Color riskHigh = Color(0xFFC0392B);

  /// Fill for solid low-risk badges carrying white text (5.3:1).
  static const Color riskLowFill = strictContrast ? Color(0xFF237A4A) : riskLow;

  // Compatibility names used by existing screens.
  static const Color secondary = primaryShade;
  static const Color primaryBlue = primary;
  static const Color darkBlue = primaryShade;
  static const Color gradientTop = primary;
  static const Color gradientBottom = primaryShade;
  static const Color success = riskLow;
  static const Color warning = riskMedium;
  static const Color danger = riskHigh;
  static const Color info = primaryShade;
  static const Color adminGreen = riskLow;
  static const Color darkAdminGreen = riskLowFill;
  static const Color textPrimary = ink;

  /// Solid fill to use behind a label for a status/risk [color].
  static Color badgeFill(Color color) => color == riskLow ? riskLowFill : color;

  /// Label color that passes AA on [badgeFill] of [color].
  static Color onBadge(Color color) => color == riskMedium ? ink : Colors.white;
}

/// Clay surfaces: one gradient and exactly two outer shadows.
///
/// If scrolling stutters on a mid-range phone, lower the blurRadius values
/// here first.
class AppClay {
  static const Duration pressDuration = Duration(milliseconds: 120);
  static const double pressedScale = 0.97;

  static const LinearGradient surfaceGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.clayLight, AppColors.clayDark],
  );

  static const List<BoxShadow> shadows = [
    BoxShadow(color: AppColors.clayShade, offset: Offset(8, 8), blurRadius: 18),
    BoxShadow(
      color: AppColors.clayHighlight,
      offset: Offset(-6, -6),
      blurRadius: 14,
    ),
  ];

  static const List<BoxShadow> pressedShadows = [
    BoxShadow(color: AppColors.clayShade, offset: Offset(3, 3), blurRadius: 8),
    BoxShadow(
      color: AppColors.clayHighlight,
      offset: Offset(-3, -3),
      blurRadius: 8,
    ),
  ];

  /// Primary (blue) button. See [AppColors.strictContrast].
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: AppColors.strictContrast
        ? [AppColors.primaryStrong, AppColors.primaryShade]
        : [AppColors.primaryLight, AppColors.primary],
  );

  static const Color _primaryShade = Color(0x612A62A0); // @ 38%
  static const Color _primaryHighlight = Color(0xE6FFFFFF); // white @ 90%

  static const List<BoxShadow> primaryShadows = [
    BoxShadow(color: _primaryShade, offset: Offset(6, 6), blurRadius: 14),
    BoxShadow(color: _primaryHighlight, offset: Offset(-4, -4), blurRadius: 10),
  ];

  static const List<BoxShadow> primaryPressedShadows = [
    BoxShadow(color: _primaryShade, offset: Offset(3, 3), blurRadius: 8),
    BoxShadow(color: _primaryHighlight, offset: Offset(-3, -3), blurRadius: 8),
  ];

  /// Solid-color pill (e.g. green "Approve"): same gradient direction,
  /// never lighter than [base] so its white label keeps base contrast.
  static LinearGradient solidGradient(Color base) {
    final hsl = HSLColor.fromColor(base);
    final darker =
        hsl.withLightness((hsl.lightness - 0.06).clamp(0.0, 1.0)).toColor();
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [base, darker],
    );
  }

  /// Fake inset (Flutter has no inset BoxShadow): darker top-left,
  /// lighter bottom-right.
  static const LinearGradient insetGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFCCDBEC), Color(0xFFE6EFF9)],
  );

  /// 1px edge ring under [insetGradient]: dark on the top-left only.
  static const Color insetEdgeColor = Color(0xFFA9BDD4);
  static const LinearGradient insetEdge = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [insetEdgeColor, Color(0x00A9BDD4)],
    stops: [0.0, 0.55],
  );
}

/// Typography helpers: Nunito for headings and buttons, Public Sans for body.
class AppText {
  static TextStyle heading({
    double size = 18,
    FontWeight weight = FontWeight.w700,
    Color color = AppColors.ink,
  }) =>
      GoogleFonts.nunito(fontSize: size, fontWeight: weight, color: color);

  static TextStyle button({double size = 14}) =>
      GoogleFonts.nunito(fontSize: size, fontWeight: FontWeight.w600);
}

class AppTheme {
  static ThemeData get lightTheme {
    final body = GoogleFonts.publicSansTextTheme().apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    );
    TextStyle nunito(FontWeight w) =>
        GoogleFonts.nunito(fontWeight: w, color: AppColors.ink);
    final textTheme = body.copyWith(
      displayLarge: body.displayLarge?.merge(nunito(FontWeight.w700)),
      displayMedium: body.displayMedium?.merge(nunito(FontWeight.w700)),
      displaySmall: body.displaySmall?.merge(nunito(FontWeight.w700)),
      headlineLarge: body.headlineLarge?.merge(nunito(FontWeight.w700)),
      headlineMedium: body.headlineMedium?.merge(nunito(FontWeight.w700)),
      headlineSmall: body.headlineSmall?.merge(nunito(FontWeight.w700)),
      titleLarge: body.titleLarge?.merge(nunito(FontWeight.w700)),
      titleMedium: body.titleMedium?.merge(nunito(FontWeight.w600)),
      labelLarge: body.labelLarge?.merge(nunito(FontWeight.w600)),
    );

    const pill = StadiumBorder();
    final buttonText = AppText.button();
    const buttonPadding = EdgeInsets.symmetric(horizontal: 20, vertical: 13);

    InputBorder clayBorder(Color color, double width) => ClayInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide(color: color, width: width),
        );

    return ThemeData(
      useMaterial3: true,
      colorScheme: const ColorScheme.light(
        primary: AppColors.primary,
        onPrimary: Colors.white,
        secondary: AppColors.primaryShade,
        onSecondary: Colors.white,
        surface: AppColors.surface,
        onSurface: AppColors.ink,
        onSurfaceVariant: AppColors.textSecondary,
        surfaceContainerLowest: Colors.white,
        surfaceContainerLow: AppColors.surface,
        surfaceContainer: Color(0xFFEEF3F9),
        surfaceContainerHigh: Color(0xFFE6EDF5),
        surfaceContainerHighest: Color(0xFFDFE8F2),
        surfaceTint: Colors.transparent,
        error: AppColors.riskHigh,
        onError: Colors.white,
        outline: AppColors.border,
        outlineVariant: AppColors.border,
      ),
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.surface,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: AppText.heading(size: 20),
      ),
      // Tabs: selected tab sits in a pressed-in well, like the bottom nav.
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.primaryShade,
        unselectedLabelColor: AppColors.textSecondary,
        labelStyle: AppText.button(),
        unselectedLabelStyle: AppText.button(),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        splashFactory: NoSplash.splashFactory,
        indicator: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: AppClay.insetGradient,
          border: Border.all(color: AppClay.insetEdgeColor),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          foregroundColor: Colors.white,
          disabledForegroundColor: Colors.white.withValues(alpha: 0.9),
          backgroundColor: Colors.transparent,
          disabledBackgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          elevation: 0,
          minimumSize: const Size.fromHeight(48),
          padding: buttonPadding,
          shape: pill,
          textStyle: buttonText,
          splashFactory: NoSplash.splashFactory,
          overlayColor: Colors.transparent,
          backgroundBuilder: ClayButtonSurface.primary(),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          foregroundColor: Colors.white,
          disabledForegroundColor: Colors.white.withValues(alpha: 0.9),
          backgroundColor: Colors.transparent,
          disabledBackgroundColor: Colors.transparent,
          minimumSize: const Size.fromHeight(48),
          padding: buttonPadding,
          shape: pill,
          textStyle: buttonText,
          splashFactory: NoSplash.splashFactory,
          overlayColor: Colors.transparent,
          backgroundBuilder: ClayButtonSurface.primary(),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          iconColor: AppColors.primary,
          disabledForegroundColor: AppColors.textSecondary,
          backgroundColor: Colors.transparent,
          side: BorderSide.none,
          minimumSize: const Size.fromHeight(48),
          padding: buttonPadding,
          shape: pill,
          textStyle: buttonText,
          splashFactory: NoSplash.splashFactory,
          overlayColor: Colors.transparent,
          backgroundBuilder: ClayButtonSurface.secondary(),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primaryShade,
          minimumSize: const Size(48, 48),
          shape: pill,
          textStyle: AppText.button(),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.field,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        labelStyle: const TextStyle(color: AppColors.textSecondary),
        floatingLabelStyle: const TextStyle(
          color: AppColors.primaryShade,
          fontWeight: FontWeight.w600,
        ),
        hintStyle: const TextStyle(color: AppColors.textSecondary),
        prefixIconColor: AppColors.textSecondary,
        suffixIconColor: AppColors.textSecondary,
        border: clayBorder(AppColors.border, 1),
        enabledBorder: clayBorder(AppColors.border, 1),
        focusedBorder: clayBorder(AppColors.primary, 2),
        errorBorder: clayBorder(AppColors.riskHigh, 1.5),
        focusedErrorBorder: clayBorder(AppColors.riskHigh, 2),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: AppColors.border),
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        titleTextStyle: AppText.heading(size: 20),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        side: const BorderSide(color: AppColors.border),
        shape: const StadiumBorder(),
        labelStyle: AppText.button().copyWith(color: AppColors.ink),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primaryShade
              : null,
        ),
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: AppColors.primary),
      dividerTheme: const DividerThemeData(color: AppColors.border),
    );
  }
}
