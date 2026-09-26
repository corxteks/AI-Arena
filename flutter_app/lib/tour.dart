import 'package:flutter/material.dart';
import 'ui.dart';
import 'data.dart';

class TournamentPage extends StatefulWidget {
  final bool admin;
  const TournamentPage({super.key, required this.admin});
  @override
  State<TournamentPage> createState() => _TournamentPageState();
}

class _TournamentPageState extends State<TournamentPage> {
  int seg = 0;
  @override
  Widget build(BuildContext context) {
    const steps = ['Pendaftaran', 'Pasangan', 'Jadwal', 'Berjalan'];
    return Screen(
      title: 'Ganda Seimbang Open',
      bottom: widget.admin ? Btn('Pasangkan pemain', icon: Icons.people_alt_rounded, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PairingPage()))) : null,
      children: [
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              for (var i = 0; i < steps.length; i++) ...[
                Expanded(
                  child: Column(children: [
                    Container(
                      width: 26, height: 26,
                      decoration: BoxDecoration(color: i <= 3 ? C.blue : C.line, shape: BoxShape.circle),
                      child: Icon(i < 3 ? Icons.check_rounded : Icons.play_arrow_rounded, size: 15, color: Colors.white),
                    ),
                    const SizedBox(height: 5),
                    Text(steps[i], style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: i == 3 ? C.blue : C.mut)),
                  ]),
                ),
              ],
            ]),
            const SizedBox(height: 14),
            const Wrap(spacing: 8, runSpacing: 8, children: [
              Pill('Setengah kompetisi', icon: Icons.account_tree_rounded),
              Pill('2 grup', bg: C.softTeal, fg: C.teal),
              Pill('Veteran ≥ 90 th', bg: C.softAmber, fg: C.amber),
              Pill('Rp 100.000', bg: C.bg, fg: C.mut),
            ]),
          ]),
        ),
        const SizedBox(height: 14),
        Seg(const ['Bagan', 'Klasemen', 'Jadwal', 'Peserta'], seg, (v) => setState(() => seg = v)),
        const SizedBox(height: 14),
        if (seg == 0) _bracket(),
        if (seg == 1) ..._standings(),
        if (seg == 2) _schedule(),
        if (seg == 3) ..._participants(),
      ],
    );
  }

  Widget _match(String a, String b, {int? sa, int? sb}) => Container(
        width: 150,
        margin: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: C.line)),
        child: Column(children: [
          _row(a, sa, sa != null && sb != null && sa > sb),
          const Divider(height: 1, color: C.line),
          _row(b, sb, sa != null && sb != null && sb > sa),
        ]),
      );

  Widget _row(String n, int? s, bool w) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(children: [
          Expanded(child: Text(n, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: w ? FontWeight.w900 : FontWeight.w600, color: n == 'Menunggu' ? C.mut : C.ink))),
          if (s != null) Text('$s', style: TextStyle(fontWeight: FontWeight.w900, color: w ? C.blue : C.mut)),
        ]),
      );

  Widget _bracket() => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Column(children: [
            const Text('Semifinal', style: TextStyle(color: C.mut, fontWeight: FontWeight.w800, fontSize: 12)),
            const SizedBox(height: 6),
            _match('Arga / Bella', 'Kenzo / Luna', sa: 2, sb: 0),
            const SizedBox(height: 26),
            _match('Cakra / Dinda', 'Gading / Hana', sa: 1, sb: 2),
          ]),
          const SizedBox(width: 24),
          Column(children: [
            const Text('Final', style: TextStyle(color: C.mut, fontWeight: FontWeight.w800, fontSize: 12)),
            const SizedBox(height: 6),
            _match('Arga / Bella', 'Gading / Hana'),
          ]),
          const SizedBox(width: 24),
          Column(children: [
            const Text('Juara', style: TextStyle(color: C.mut, fontWeight: FontWeight.w800, fontSize: 12)),
            const SizedBox(height: 6),
            Container(
              width: 120, padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: C.softAmber, borderRadius: BorderRadius.circular(16)),
              child: Column(children: const [Icon(Icons.emoji_events_rounded, color: C.amber, size: 34), SizedBox(height: 4), Text('Menunggu', style: TextStyle(fontWeight: FontWeight.w800, color: C.amber))]),
            ),
          ]),
        ]),
      );

  List<Widget> _standings() => [
        for (final g in [('Grup A', pairs.sublist(0, 4)), ('Grup B', pairs.sublist(4, 8))]) ...[
          Padding(padding: const EdgeInsets.fromLTRB(4, 4, 4, 8), child: Text(g.$1, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15))),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (var i = 0; i < g.$2.length; i++) ...[
                ListTile(
                  dense: true,
                  leading: Container(width: 26, height: 26, alignment: Alignment.center, decoration: BoxDecoration(color: i < 2 ? C.softBlue : C.bg, shape: BoxShape.circle), child: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w900, color: i < 2 ? C.blue : C.mut, fontSize: 12))),
                  title: Text(g.$2[i].name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  trailing: Text('${3 - i} M · ${(3 - i) * 2} P', style: const TextStyle(color: C.mut, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                if (i < g.$2.length - 1) const Divider(height: 1, color: C.line),
              ],
            ]),
          ),
          const SizedBox(height: 12),
        ],
      ];

  Widget _schedule() => Column(children: [
        for (final r in const [('Sab 10.00', 'Lap 1 · Grup A', 'Arga / Bella vs Cakra / Dinda'), ('Sab 10.00', 'Lap 2 · Grup B', 'Ivan / Jihan vs Oscar / Pita'), ('Sab 10.40', 'Lap 3 · Grup A', 'Elang / Fira vs Gading / Hana'), ('Min 13.00', 'Lap 1 · Final', 'Pemenang SF1 vs SF2')])
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              child: Row(children: [
                SizedBox(width: 70, child: Text(r.$1, style: const TextStyle(color: C.blue, fontWeight: FontWeight.w900, fontSize: 12.5))),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(r.$3, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)), const SizedBox(height: 2), Text(r.$2, style: const TextStyle(color: C.mut, fontSize: 12))])),
              ]),
            ),
          ),
      ]);

  List<Widget> _participants() => [
        for (final p in pairs)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              onTap: widget.admin ? () => showActions(context, title: p.name, subtitle: 'Level ${p.levels} · nilai ${p.value}', items: [
                    ActionItem(Icons.edit_outlined, 'Ubah data dan level', onTap: () => snack(context, 'Ubah data (pratinjau)')),
                    ActionItem(Icons.payments_outlined, 'Tandai lunas', onTap: () => snack(context, 'Ditandai lunas')),
                    ActionItem(Icons.call_split_rounded, 'Pisahkan pasangan', danger: true, onTap: () => snack(context, 'Pasangan dipisah')),
                  ]) : null,
              child: Row(children: [
                Avatar(p.a[0] + p.b[0], size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 3),
                    Text('Level ${p.levels} = ${p.value}', style: const TextStyle(color: C.mut, fontSize: 12)),
                  ]),
                ),
                if (p.seed != null) Padding(padding: const EdgeInsets.only(right: 6), child: Pill('Unggulan ${p.seed}', bg: C.softAmber, fg: C.amber)),
                p.paid ? const Icon(Icons.check_circle_rounded, color: C.teal) : const Icon(Icons.error_outline_rounded, color: C.amber),
              ]),
            ),
          ),
      ];
}

class PairingPage extends StatefulWidget {
  const PairingPage({super.key});
  @override
  State<PairingPage> createState() => _PairingPageState();
}

class _PairingPageState extends State<PairingPage> {
  Unpaired? first, second;
  final made = <String>[];

  int get sum => (first == null ? 0 : levelPts[first!.level]!) + (second == null ? 0 : levelPts[second!.level]!);
  bool get ok => first != null && second != null && (sum - 6).abs() <= 1;

  @override
  Widget build(BuildContext context) {
    final list = unpaired.where((u) => !made.contains(u.name)).toList();
    return Screen(
      title: 'Pasangkan pemain',
      bottom: Btn('Buat pasangan', icon: Icons.link_rounded, onTap: ok ? () {
        setState(() {
          made.addAll([first!.name, second!.name]);
          first = null;
          second = null;
        });
        snack(context, 'Pasangan dibuat');
      } : null),
      children: [
        AppCard(
          color: C.softBlue,
          border: Border.all(color: Colors.transparent),
          child: Row(children: [
            const Icon(Icons.info_outline_rounded, color: C.blue),
            const SizedBox(width: 10),
            const Expanded(child: Text('Pilih dua pemain. Jumlah nilai harus 6 ± 1.', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
          ]),
        ),
        const SizedBox(height: 14),
        AppCard(
          child: Row(children: [
            Expanded(child: _slot(first, 'Pemain 1')),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: first == null || second == null ? C.bg : (ok ? C.softTeal : C.softRed), borderRadius: BorderRadius.circular(14)),
              child: Text(first == null || second == null ? '–' : '$sum', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: first == null || second == null ? C.mut : (ok ? C.teal : C.red))),
            ),
            Expanded(child: _slot(second, 'Pemain 2')),
          ]),
        ),
        if (first != null && second != null && !ok)
          const Padding(padding: EdgeInsets.only(top: 8, left: 4), child: Text('Nilai di luar toleransi, pasangan ditolak.', style: TextStyle(color: C.red, fontWeight: FontWeight.w700, fontSize: 12.5))),
        SectionTitle('Belum berpasangan (${list.length})'),
        for (final u in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AppCard(
              onTap: () => setState(() {
                if (first == u) {
                  first = null;
                } else if (second == u) {
                  second = null;
                } else if (first == null) {
                  first = u;
                } else {
                  second = u;
                }
              }),
              border: Border.all(color: (first == u || second == u) ? C.blue : C.line, width: (first == u || second == u) ? 1.6 : 1),
              child: Row(children: [
                Avatar(u.name.split(' ').map((e) => e[0]).take(2).join(), size: 38, bg: levelColor(u.level).withOpacity(.12), fg: levelColor(u.level)),
                const SizedBox(width: 12),
                Expanded(child: Text(u.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                Pill('Level ${u.level}', bg: levelColor(u.level).withOpacity(.12), fg: levelColor(u.level)),
              ]),
            ),
          ),
        const SizedBox(height: 4),
        OutlinedButton.icon(
          onPressed: () => snack(context, 'Disusun otomatis, silakan diperiksa'),
          icon: const Icon(Icons.auto_awesome_rounded),
          label: const Text('Susun otomatis'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        ),
      ],
    );
  }

  Widget _slot(Unpaired? u, String hint) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: C.bg, borderRadius: BorderRadius.circular(14)),
        child: Column(children: [
          u == null ? const IconBubble(Icons.person_add_alt_1_rounded, bg: Colors.white, fg: C.mut, size: 38) : Avatar(u.name[0], size: 38, bg: levelColor(u.level).withOpacity(.12), fg: levelColor(u.level)),
          const SizedBox(height: 6),
          Text(u?.name.split(' ').first ?? hint, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: u == null ? C.mut : C.ink)),
          if (u != null) Text('Level ${u.level}', style: const TextStyle(fontSize: 11, color: C.mut)),
        ]),
      );
}
