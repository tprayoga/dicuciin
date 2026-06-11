import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'src/api_client.dart';
import 'src/kiosk_app.dart';
import 'src/kiosk_controller.dart';
import 'src/device_storage.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );

  runApp(
    ChangeNotifierProvider(
      create: (_) =>
          KioskController(ApiClient(apiBaseUrl), const DeviceStorage())
            ..initialize(),
      child: const KioskApp(),
    ),
  );
}
