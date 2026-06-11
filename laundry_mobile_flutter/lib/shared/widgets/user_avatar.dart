import 'package:flutter/material.dart';
import '../../core/config/app_config.dart';

/// Avatar bulat pengguna: menampilkan foto dari [avatarUrl] (relatif/absolut)
/// bila ada, dan jatuh ke ikon/inisial bila kosong atau gagal dimuat.
class UserAvatar extends StatelessWidget {
  const UserAvatar({
    super.key,
    required this.avatarUrl,
    this.name,
    this.size = 40,
    this.backgroundColor,
    this.foregroundColor,
    this.iconSize,
  });

  final String? avatarUrl;
  final String? name;
  final double size;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final double? iconSize;

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.assetUrl(avatarUrl);
    final bg = backgroundColor ?? Colors.white.withValues(alpha: 0.2);
    final fg = foregroundColor ?? Colors.white;

    return ClipOval(
      child: Container(
        width: size,
        height: size,
        color: bg,
        child: url == null
            ? _fallback(fg)
            : Image.network(
                url,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stack) => _fallback(fg),
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : _fallback(fg),
              ),
      ),
    );
  }

  Widget _fallback(Color fg) {
    final initial = (name ?? '').trim();
    if (initial.isNotEmpty) {
      return Center(
        child: Text(
          initial.characters.first.toUpperCase(),
          style: TextStyle(
            color: fg,
            fontSize: size * 0.42,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }
    return Icon(Icons.person, color: fg, size: iconSize ?? size * 0.5);
  }
}
