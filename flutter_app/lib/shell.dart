import 'package:flutter/material.dart';
import 'ui.dart';
import 'data.dart';
import 'home.dart';
import 'tanding.dart';
import 'more.dart';

class Shell extends StatefulWidget {
  final bool admin;
  const Shell({super.key, required this.admin});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final pages = [
      HomePage(admin: widget.admin),
      TandingPage(admin: widget.admin),
      const RankingPage(),
      const ChatPage(),
      ProfilePage(admin: widget.admin),
    ];
    return Scaffold(
      body: SafeArea(bottom: false, child: IndexedStack(index: tab, children: pages)),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: C.line))),
        child: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (v) => setState(() => tab = v),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Beranda'),
            NavigationDestination(icon: Icon(Icons.sports_tennis_outlined), selectedIcon: Icon(Icons.sports_tennis_rounded), label: 'Tanding'),
            NavigationDestination(icon: Icon(Icons.leaderboard_outlined), selectedIcon: Icon(Icons.leaderboard_rounded), label: 'Peringkat'),
            NavigationDestination(icon: Icon(Icons.chat_bubble_outline_rounded), selectedIcon: Icon(Icons.chat_bubble_rounded), label: 'Obrolan'),
            NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'Profil'),
          ],
        ),
      ),
    );
  }
}
