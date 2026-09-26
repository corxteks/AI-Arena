import 'package:flutter/material.dart';
import 'ui.dart';
import 'auth.dart';

void main() => runApp(const ArenaApp());

class ArenaApp extends StatelessWidget {
  const ArenaApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'AI ARENA',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const SplashPage(),
        builder: (c, child) => Container(
          color: const Color(0xFFDDE3F0),
          alignment: Alignment.center,
          child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: ClipRect(child: child!)),
        ),
      );
}
