import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/config/app_config.dart';
import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'core/storage/token_storage.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_flow_screens.dart';
import 'features/auth/auth_service.dart';
import 'features/customer/customer_controller.dart';
import 'features/customer/customer_service.dart';
import 'features/customer/home_screen.dart';
import 'features/customer/wallet_controller.dart';
import 'shared/widgets/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final apiClient = ApiClient(baseUrl: AppConfig.apiBaseUrl);
  final tokenStorage = TokenStorage();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => AuthController(
            authService: AuthService(apiClient),
            tokenStorage: tokenStorage,
          ),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              CustomerController(customerService: CustomerService(apiClient)),
        ),
        ChangeNotifierProvider(create: (_) => WalletController()),
      ],
      child: const CustomerApp(),
    ),
  );
}

class CustomerApp extends StatelessWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

    return MaterialApp(
      title: 'Dicuciin Customer',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: switch (auth.status) {
        AuthStatus.loading => const SplashScreen(),
        AuthStatus.authenticated => const HomeScreen(),
        AuthStatus.unauthenticated => const WelcomeScreen(),
      },
    );
  }
}
