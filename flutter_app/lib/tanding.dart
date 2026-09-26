import 'package:flutter/material.dart';
import 'ui.dart';
import 'data.dart';
import 'match.dart';
import 'tour.dart';

class TandingPage extends StatefulWidget {
  final bool admin;
  const TandingPage({super.key, required this.admin});
  @override
  State<TandingPage> createState() => _TandingPageState();
}

class _TandingPageState extends State<TandingPage> {
  int seg = 0, court = 0;
  final pc = PageController(viewportFraction: .92);
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
      const Text('Tanding', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
      const SizedBox(height: 12),
      Seg(const ['Lapangan', 'Jadwal', 'Turnamen', 'Riwayat'], seg, (v) => setState(() => seg = v)),
      const SizedBox(height: 16),
      if (seg == 0) ..._courts(),
      if (seg == 1) ..._schedule(),
      if (seg == 2) ..._tours(),
      if (seg == 3) ..._history(),
    ]);
  }

  List<Widget> _courts() => [
        SizedBox(
          height: 262,
          child: PageView.builder(
            controller: pc,
            padEnds: false,
            itemCount: courts.length,
            onPageChanged: (v) => setState(() => court = v),
            itemBuilder: (c, i) => Padding(padding: const EdgeInsets.only(right: 10), child: _courtCard(courts[i])),
          ),
        ),
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var k = 0; k < courts.length; k++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.all(3),
              width: k == court ? 20 : 7, height: 7,
              decoration: BoxDecoration(color: k == court ? C.blue : C.line, borderRadius: BorderRadius.circular(4)),
            ),
        ]),
        const SectionTitle('Laga saya berikutnya'),
        AppCard(
          child: Row(children: [
            const IconBubble(Icons.schedule_rounded, size: 46),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Budi / Citra vs Eko / Fajar', style: TextStyle(fontWeight: FontWeight.w800)),
                SizedBox(height: 2),
                Text('Lap 2 · jadwal 16.50 · estimasi 17.05', style: TextStyle(color: C.mut, fontSize: 12.5)),
              ]),
            ),
            const Pill('Siap-siap', bg: C.softAmber, fg: C.amber),
          ]),
        ),
      ];

  Widget _courtCard(Court c) {
    final live = c.live;
    return AppCard(
      padding: const EdgeInsets.all(16),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MatchControlPage(court: c, admin: widget.admin))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('Lapangan ${c.no}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          const Spacer(),
          live ? const Pill('LIVE · Game', bg: C.softRed, fg: C.red, icon: Icons.circle) : const Pill('Kosong', bg: C.softTeal, fg: C.teal),
        ]),
        const SizedBox(height: 14),
        if (live) ...[
          Row(children: [
            Expanded(child: _side(c.a!, c.sa, c.sa >= c.sb)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Column(children: [
                Text('Game ${c.game}', style: const TextStyle(color: C.mut, fontSize: 11.5, fontWeight: FontWeight.w700)),
                Text('${c.minutes} mnt', style: const TextStyle(color: C.mut, fontSize: 11)),
              ]),
            ),
            Expanded(child: _side(c.b!, c.sb, c.sb > c.sa)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            const Icon(Icons.sports_rounded, size: 16, color: C.mut),
            const SizedBox(width: 6),
            Text('Wasit ${c.umpire}', style: const TextStyle(color: C.mut, fontSize: 12.5)),
          ]),
        ] else
          Container(
            height: 92,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: C.bg, borderRadius: BorderRadius.circular(14)),
            child: const Text('Belum ada pertandingan', style: TextStyle(color: C.mut, fontWeight: FontWeight.w600)),
          ),
        const Spacer(),
        const Divider(color: C.line),
        Row(children: [
          const Icon(Icons.arrow_forward_rounded, size: 16, color: C.blue),
          const SizedBox(width: 6),
          Expanded(child: Text('${c.next}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700))),
          Text('${c.nextTime}', style: const TextStyle(color: C.mut, fontSize: 12.5)),
        ]),
      ]),
    );
  }

  Widget _side(String name, int score, bool lead) => Column(children: [
        Text(name, textAlign: TextAlign.center, maxLines: 2, style: TextStyle(fontWeight: lead ? FontWeight.w900 : FontWeight.w600, fontSize: 13)),
        const SizedBox(height: 6),
        Text('$score', style: TextStyle(fontSize: 46, fontWeight: FontWeight.w900, color: lead ? C.blue : C.mut, height: 1)),
      ]);

  List<Widget> _schedule() {
    const rows = [
      ('10.00', 'Lap 1', 'Vino / Wahyu vs Elang / Fira', 'Grup A'),
      ('10.00', 'Lap 2', 'Gita / Hendra vs Kiki / Lina', 'Grup A'),
      ('10.30', 'Lap 3', 'Arga / Bella vs Malik / Nadin', 'Grup B'),
      ('11.10', 'Lap 1', 'Budi / Citra vs Eko / Fajar', 'Grup B'),
      ('11.10', 'Lap 2', 'Cakra / Dinda vs Oscar / Pita', 'Grup A'),
    ];
    return [
      for (final r in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: AppCard(
            onTap: () => showActions(context, title: r.$3, subtitle: '${r.$2} · ${r.$1}', items: [
              ActionItem(Icons.campaign_rounded, 'Panggil pemain', onTap: () => snack(context, 'Panggilan 1 dikirim')),
              ActionItem(Icons.swap_horiz_rounded, 'Geser jadwal', onTap: () => snack(context, 'Jadwal digeser')),
              ActionItem(Icons.tune_rounded, 'Pengaturan pertandingan', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MatchControlPage(court: courts[0], admin: widget.admin)))),
            ]),
            child: Row(children: [
              SizedBox(width: 50, child: Text(r.$1, style: const TextStyle(fontWeight: FontWeight.w900, color: C.blue))),
              Container(width: 1, height: 38, color: C.line, margin: const EdgeInsets.only(right: 12)),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r.$3, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  const SizedBox(height: 3),
                  Text('${r.$2} · ${r.$4}', style: const TextStyle(color: C.mut, fontSize: 12)),
                ]),
              ),
              const Icon(Icons.more_horiz_rounded, color: C.mut),
            ]),
          ),
        ),
    ];
  }

  List<Widget> _tours() => [
        AppCard(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TournamentPage(admin: widget.admin))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const IconBubble(Icons.emoji_events_rounded, bg: C.softAmber, fg: C.amber, size: 48),
              const SizedBox(width: 12),
              const Expanded(child: Text('Ganda Seimbang Open', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
              const Pill('Berjalan', bg: C.softTeal, fg: C.teal),
            ]),
            const SizedBox(height: 12),
            const Text('Setengah kompetisi · 2 grup · 8 pasangan', style: TextStyle(color: C.mut, fontSize: 13)),
            const SizedBox(height: 4),
            const Text('27–28 September 2026 · Pendaftaran Rp 100.000', style: TextStyle(color: C.mut, fontSize: 13)),
          ]),
        ),
        if (widget.admin) ...[
          const SizedBox(height: 12),
          Btn('Buat turnamen baru', icon: Icons.add_rounded, outlined: true, onTap: () => snack(context, 'Formulir turnamen (pratinjau)')),
        ],
      ];

  List<Widget> _history() => [
        for (final h in const [
          ('Budi / Citra', 'Gita / Hendra', '21–15 · 21–18', true),
          ('Eko / Fajar', 'Kiki / Lina', '18–21 · 16–21', false),
          ('Vino / Wahyu', 'Elang / Fira', '21–19 · 15–21 · 21–17', true),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              child: Row(children: [
                IconBubble(h.$4 ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded, bg: h.$4 ? C.softTeal : C.softRed, fg: h.$4 ? C.teal : C.red, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${h.$1}  vs  ${h.$2}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                    const SizedBox(height: 3),
                    Text('${h.$3} · 41 mnt', style: const TextStyle(color: C.mut, fontSize: 12)),
                  ]),
                ),
              ]),
            ),
          ),
      ];
}
