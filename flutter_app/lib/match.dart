import 'dart:async';
import 'package:flutter/material.dart';
import 'ui.dart';
import 'data.dart';

class MatchControlPage extends StatefulWidget {
  final Court court;
  final bool admin;
  const MatchControlPage({super.key, required this.court, required this.admin});
  @override
  State<MatchControlPage> createState() => _MatchControlPageState();
}

class _MatchControlPageState extends State<MatchControlPage> {
  int calls = 0;
  bool here = false;
  String status = 'Menunggu pemain';
  String ump = 'Belum dipilih';

  @override
  Widget build(BuildContext context) {
    final c = widget.court;
    final a = c.a ?? 'Arga / Bella', b = c.b ?? 'Malik / Nadin';
    return Screen(
      title: 'Pengaturan pertandingan',
      bottom: Btn('Mulai pertandingan', icon: Icons.play_arrow_rounded, onTap: () {
        Navigator.push(context, MaterialPageRoute(builder: (_) => UmpirePage(a: a, b: b)));
      }),
      children: [
        AppCard(
          child: Column(children: [
            Text('Lapangan ${c.no} · Grup A', style: const TextStyle(color: C.mut, fontWeight: FontWeight.w700, fontSize: 12.5)),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: Text(a, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w900))),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Pill('VS')),
              Expanded(child: Text(b, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w900))),
            ]),
          ]),
        ),
        const SectionTitle('Wasit'),
        AppCard(
          onTap: () => showActions(context, title: 'Pilih wasit', items: [
            for (final n in ['Indah Sari', 'Andi Saputra', 'Joko Susilo'])
              ActionItem(Icons.sports_rounded, n, onTap: () => setState(() => ump = n)),
          ]),
          child: Row(children: [
            const IconBubble(Icons.sports_rounded, size: 40),
            const SizedBox(width: 12),
            Expanded(child: Text(ump, style: const TextStyle(fontWeight: FontWeight.w700))),
            const Icon(Icons.chevron_right_rounded, color: C.mut),
          ]),
        ),
        const SectionTitle('Panggilan pemain'),
        AppCard(
          child: Column(children: [
            Row(children: [
              for (var k = 1; k <= 3; k++)
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(color: calls >= k ? C.softAmber : C.bg, borderRadius: BorderRadius.circular(14)),
                    child: Column(children: [
                      Icon(Icons.campaign_rounded, color: calls >= k ? C.amber : C.mut),
                      const SizedBox(height: 4),
                      Text('Panggilan $k', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: calls >= k ? C.amber : C.mut)),
                    ]),
                  ),
                ),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: Btn(calls >= 3 ? 'WO tersedia' : 'Panggil pemain', outlined: true, icon: Icons.campaign_rounded, onTap: () {
                  if (calls < 3) {
                    setState(() {
                      calls++;
                      status = 'Dipanggil ($calls)';
                    });
                    snack(context, 'Panggilan $calls dikirim');
                  }
                }),
              ),
            ]),
            if (calls >= 3) ...[
              const SizedBox(height: 10),
              Btn('Nyatakan WO', color: C.red, icon: Icons.flag_rounded, onTap: () => snack(context, 'WO dicatat')),
            ],
            const SizedBox(height: 6),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: here,
              activeColor: C.blue,
              title: const Text('Pemain sudah hadir', style: TextStyle(fontWeight: FontWeight.w700)),
              onChanged: (v) => setState(() {
                here = v;
                status = v ? 'Siap main' : 'Menunggu pemain';
              }),
            ),
          ]),
        ),
        const SectionTitle('Status'),
        AppCard(child: Row(children: [const IconBubble(Icons.info_outline_rounded, size: 40), const SizedBox(width: 12), Text(status, style: const TextStyle(fontWeight: FontWeight.w800))])),
      ],
    );
  }
}

class UmpirePage extends StatefulWidget {
  final String a, b;
  const UmpirePage({super.key, required this.a, required this.b});
  @override
  State<UmpirePage> createState() => _UmpirePageState();
}

class _UmpirePageState extends State<UmpirePage> {
  int sa = 0, sb = 0, ga = 0, gb = 0, sec = 0;
  bool serveA = true, swapped = false, live = true;
  late Timer t;
  @override
  void initState() {
    super.initState();
    t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => sec++));
  }

  @override
  void dispose() {
    t.cancel();
    super.dispose();
  }

  void point(bool forA) {
    setState(() {
      if (forA) {
        sa++;
        serveA = true;
      } else {
        sb++;
        serveA = false;
      }
      if ((sa >= 21 || sb >= 21) && (sa - sb).abs() >= 2) {
        if (sa > sb) ga++; else gb++;
        sa = 0;
        sb = 0;
        swapped = !swapped;
        snack(context, 'Game selesai · pindah sisi');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = swapped ? widget.b : widget.a, r = swapped ? widget.a : widget.b;
    final ls = swapped ? sb : sa, rs = swapped ? sa : sb;
    final lServe = swapped ? !serveA : serveA;
    final mm = (sec ~/ 60).toString().padLeft(2, '0'), ss = (sec % 60).toString().padLeft(2, '0');
    return Scaffold(
      backgroundColor: C.navy,
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
            child: Row(children: [
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: Colors.white)),
              const Text('Mode wasit', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              const Spacer(),
              const Pill('LIVE', bg: Color(0x33EF4C5B), fg: Color(0xFFFF8C96), icon: Icons.circle),
              const SizedBox(width: 10),
              Text('$mm:$ss', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
            ]),
          ),
          const SizedBox(height: 8),
          Text('Game ${ga + gb + 1}  ·  $ga – $gb', style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.w700)),
          Expanded(
            child: Row(children: [
              Expanded(child: _side(l, ls, lServe, () => point(!swapped))),
              Container(width: 1, margin: const EdgeInsets.symmetric(vertical: 40), color: Colors.white12),
              Expanded(child: _side(r, rs, !lServe, () => point(swapped))),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => setState(() => swapped = !swapped), icon: const Icon(Icons.swap_horiz_rounded), label: const Text('Tukar sisi'), style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white24), minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))))),
              const SizedBox(width: 10),
              Expanded(child: FilledButton.icon(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.flag_rounded), label: const Text('Selesai'), style: FilledButton.styleFrom(backgroundColor: C.blue, minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))))),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _side(String name, int s, bool serve, VoidCallback tap) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: tap,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(name, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          AnimatedOpacity(opacity: serve ? 1 : 0, duration: const Duration(milliseconds: 200), child: const Pill('Servis', bg: Color(0x33FFFFFF), fg: Colors.white, icon: Icons.sports_tennis_rounded)),
          const SizedBox(height: 10),
          Text('$s', style: const TextStyle(color: Colors.white, fontSize: 104, fontWeight: FontWeight.w900, height: 1)),
          const SizedBox(height: 8),
          const Text('ketuk untuk +1', style: TextStyle(color: Colors.white38, fontSize: 12)),
        ]),
      );
}
