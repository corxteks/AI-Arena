import 'dart:async';
import 'package:flutter/material.dart';
import 'ui.dart';
import 'shell.dart';

class Logo extends StatelessWidget {
  final double size;
  final bool light;
  const Logo({super.key, this.size = 72, this.light = false});
  @override
  Widget build(BuildContext context) => Container(
        width: size, height: size,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: light ? [Colors.white, Colors.white] : [C.blue, C.blue2], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(size * .3),
          boxShadow: [BoxShadow(color: C.blue.withOpacity(.35), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        child: Icon(Icons.sports_tennis_rounded, color: light ? C.blue : Colors.white, size: size * .55),
      );
}

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});
  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 1400), () {
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const OnboardPage()));
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: const [
            Logo(size: 92),
            SizedBox(height: 20),
            Text('AI ARENA', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
            SizedBox(height: 4),
            Text('Komunitas bulutangkis GOR', style: TextStyle(color: C.mut)),
          ]),
        ),
      );
}

class OnboardPage extends StatefulWidget {
  const OnboardPage({super.key});
  @override
  State<OnboardPage> createState() => _OnboardPageState();
}

class _OnboardPageState extends State<OnboardPage> {
  final pc = PageController();
  int i = 0;
  static const slides = [
    (Icons.scoreboard_rounded, 'Skor langsung', 'Pantau tiga lapangan dan skor pertandingan secara langsung dari HP.'),
    (Icons.diversity_3_rounded, 'Ganda seimbang', 'Pasangkan pemain lintas level agar tiap laga terasa adil dan seru.'),
    (Icons.emoji_events_rounded, 'Turnamen rapi', 'Jadwal, bagan, dan klasemen tersusun otomatis oleh pengelola.'),
  ];
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Column(children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: go, child: const Text('Lewati', style: TextStyle(color: C.mut, fontWeight: FontWeight.w700))),
            ),
            Expanded(
              child: PageView(
                controller: pc,
                onPageChanged: (v) => setState(() => i = v),
                children: [
                  for (final s in slides)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Container(
                          width: 220, height: 220,
                          decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [C.softBlue, Color(0xFFF3F6FF)])),
                          child: Icon(s.$1, size: 96, color: C.blue),
                        ),
                        const SizedBox(height: 36),
                        Text(s.$2, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 10),
                        Text(s.$3, textAlign: TextAlign.center, style: const TextStyle(color: C.mut, height: 1.5, fontSize: 15)),
                      ]),
                    ),
                ],
              ),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var k = 0; k < slides.length; k++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.all(3),
                  width: k == i ? 22 : 7, height: 7,
                  decoration: BoxDecoration(color: k == i ? C.blue : C.line, borderRadius: BorderRadius.circular(4)),
                ),
            ]),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Btn(i == slides.length - 1 ? 'Mulai' : 'Lanjut', onTap: () {
                if (i == slides.length - 1) {
                  go();
                } else {
                  pc.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
                }
              }),
            ),
          ]),
        ),
      );

  void go() => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginPage()));
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool otp = false;
  bool admin = false;
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(26), children: [
            const SizedBox(height: 24),
            const Align(alignment: Alignment.centerLeft, child: Logo(size: 60)),
            const SizedBox(height: 22),
            Text(otp ? 'Masukkan kode' : 'Selamat datang', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(otp ? 'Kode 4 digit dikirim ke 0812 •••• 7788' : 'Masuk dengan nomor HP untuk melanjutkan.', style: const TextStyle(color: C.mut)),
            const SizedBox(height: 26),
            if (!otp) ...[
              const TextField(keyboardType: TextInputType.phone, decoration: InputDecoration(prefixIcon: Icon(Icons.phone_iphone_rounded), hintText: '0812 3456 7788')),
              const SizedBox(height: 18),
              Btn('Kirim kode', onTap: () => setState(() => otp = true)),
              const SizedBox(height: 22),
              const Text('Masuk sebagai', style: TextStyle(color: C.mut, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 8),
              Seg(const ['Member', 'Pengelola'], admin ? 1 : 0, (v) => setState(() => admin = v == 1)),
            ] else ...[
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                for (final d in ['4', '8', '', ''])
                  Container(
                    width: 68, height: 68,
                    decoration: BoxDecoration(color: C.bg, borderRadius: BorderRadius.circular(16), border: Border.all(color: d.isEmpty ? C.line : C.blue, width: 1.5)),
                    alignment: Alignment.center,
                    child: Text(d, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
                  ),
              ]),
              const SizedBox(height: 20),
              Btn('Masuk', onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => Shell(admin: admin)))),
              const SizedBox(height: 12),
              Center(child: TextButton(onPressed: () => setState(() => otp = false), child: const Text('Ganti nomor'))),
            ],
          ]),
        ),
      );
}
