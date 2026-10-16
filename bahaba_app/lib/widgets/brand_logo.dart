import 'package:flutter/material.dart';

/// The BAHAba logo: symbol only (rounded teal tile). Never put text inside or
/// beside the image itself; screens show the name "BAHAba" as normal text.
/// Decorative by default, because the screen title already names the app.
class BrandLogo extends StatelessWidget {
  final double size;
  final String? semanticLabel;

  const BrandLogo({super.key, this.size = 112, this.semanticLabel});

  static const asset = 'assets/brand/logo-512.png';

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      asset,
      width: size,
      height: size,
      filterQuality: FilterQuality.medium,
      excludeFromSemantics: semanticLabel == null,
      semanticLabel: semanticLabel,
    );
    if (size < 48) return image;
    // Soft clay shadow under the large tile (the PNG already has rounded corners).
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.22),
        boxShadow: const [
          BoxShadow(color: Color(0x597692B8), offset: Offset(8, 8), blurRadius: 20),
          BoxShadow(color: Color(0xE6FFFFFF), offset: Offset(-6, -6), blurRadius: 16),
        ],
      ),
      child: image,
    );
  }
}

/// App bar title with the small logo mark in front of the existing title.
class BrandAppBarTitle extends StatelessWidget {
  final Widget child;
  const BrandAppBarTitle({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const BrandLogo(size: 30),
        const SizedBox(width: 10),
        Flexible(child: child),
      ],
    );
  }
}
