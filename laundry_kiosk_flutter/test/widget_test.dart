import 'package:flutter_test/flutter_test.dart';
import 'package:laundry_kiosk_flutter/src/api_client.dart';
import 'package:laundry_kiosk_flutter/src/kiosk_app.dart';
import 'package:laundry_kiosk_flutter/src/kiosk_controller.dart';
import 'package:laundry_kiosk_flutter/src/device_storage.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('menampilkan layar enrollment kiosk', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) {
          final controller = KioskController(
            ApiClient('http://localhost:3000/api/v1'),
            const DeviceStorage(),
          );
          controller.stage = KioskStage.enrollment;
          return controller;
        },
        child: const KioskApp(),
      ),
    );

    expect(find.text('Enroll Kiosk'), findsOneWidget);
    expect(find.text('Masukkan Kode Enrollment'), findsOneWidget);
    expect(find.text('Hubungkan Perangkat'), findsOneWidget);
  });
}
