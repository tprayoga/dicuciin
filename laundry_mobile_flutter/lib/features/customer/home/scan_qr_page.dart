part of '../home_screen.dart';

class _ScanQrPage extends StatelessWidget {
  const _ScanQrPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/mockups/scan_bg.png',
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Container(color: Colors.black87),
          ),
          Container(color: Colors.black.withValues(alpha: 0.45)),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 16, 10),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(
                            Icons.arrow_back,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const Text(
                        'Scan QR',
                        style: TextStyle(
                          fontSize: 17,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 110),
                Center(
                  child: SizedBox(
                    width: 260,
                    height: 260,
                    child: Stack(
                      children: [
                        _corner(top: 0, left: 0),
                        _corner(top: 0, right: 0),
                        _corner(bottom: 0, left: 0),
                        _corner(bottom: 0, right: 0),
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: Container(
                            height: 92,
                            color: Colors.white.withValues(alpha: 0.75),
                            child: const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.flashlight_on,
                                  color: Colors.white,
                                  size: 18,
                                ),
                                SizedBox(height: 6),
                                Text(
                                  'Flash on touch',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const Spacer(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _corner({double? top, double? left, double? right, double? bottom}) {
    return Positioned(
      top: top,
      left: left,
      right: right,
      bottom: bottom,
      child: Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          border: Border(
            top: top != null
                ? const BorderSide(color: _primary, width: 4)
                : BorderSide.none,
            bottom: bottom != null
                ? const BorderSide(color: _primary, width: 4)
                : BorderSide.none,
            left: left != null
                ? const BorderSide(color: _primary, width: 4)
                : BorderSide.none,
            right: right != null
                ? const BorderSide(color: _primary, width: 4)
                : BorderSide.none,
          ),
        ),
      ),
    );
  }
}

