import 'package:flutter/material.dart';
import 'ui.dart';
import 'data.dart';
import 'tour.dart';

class HomePage extends StatelessWidget {
  final bool admin;
  const HomePage({super.key, required this.admin});

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
      Row(children: [
        const Avatar('BR', size: 46),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(admin ? 'Halo, Pengelola' : 'Halo, Budi', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
            const Text('Sabtu, 26 September 2026', style: TextStyle(color: C.mut, fontSize: 12.5)),
          ]),
        ),
        Stack(children: [
          const IconBubble(Icons.notifications_none_rounded, bg: Colors.white, fg: C.ink, size: 44),
          Positioned(right: 10, top: 10, child: Container(width: 9, height: 9, decoration: BoxDecoration(color: C.red, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 1.5)))),
        ]),
      ]),
      const SizedBox(height: 18),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [C.blue, C.blue2], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: C.blue.withOpacity(.3), blurRadius: 22, offset: const Offset(0, 10))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Pill('LIVE', bg: Colors.white24, fg: Colors.white, icon: Icons.circle),
            const Spacer(),
            Text(admin ? '2 dari 3 lapangan aktif' : 'Laga berikutnya', style: const TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 16),
          Text(admin ? 'Lapangan terisi 67%' : 'Lap 2 · pukul 16.50', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text(admin ? 'Berikutnya kosong: Lap 3 sejak 15.40' : 'Budi / Citra vs Eko / Fajar', style: const TextStyle(color: Colors.white70)),
        ]),
      ),
      const SizedBox(height: 14),
      Row(children: [
        for (final s in [
          (Icons.sports_score_rounded, '18', 'Laga hari ini', C.softBlue, C.blue),
          (Icons.groups_rounded, '46', 'Member aktif', C.softTeal, C.teal),
          (Icons.emoji_events_rounded, '1', 'Turnamen', C.softAmber, C.amber),
        ])
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: AppCard(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
                child: Column(children: [
                  IconBubble(s.$1, bg: s.$4, fg: s.$5, size: 38),
                  const SizedBox(height: 8),
                  Text(s.$2, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                  Text(s.$3, style: const TextStyle(color: C.mut, fontSize: 11), textAlign: TextAlign.center),
                ]),
              ),
            ),
          ),
      ]),
      if (admin) ...[
        const SectionTitle('Perlu perhatian'),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            _att(Icons.payments_outlined, 'Iuran belum lunas', '2 pasangan · Ivan / Jihan', C.softAmber, C.amber),
            const Divider(height: 1, color: C.line),
            _att(Icons.how_to_reg_outlined, 'Anggota menunggu', '5 nama PB Rajawali & Kilat', C.softBlue, C.blue),
            const Divider(height: 1, color: C.line),
            _att(Icons.report_gmailerrorred_rounded, 'Laporan baru', '1 laporan dari obrolan', C.softRed, C.red),
          ]),
        ),
      ],
      SectionTitle('Turnamen', action: 'Lihat', onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TournamentPage(admin: admin)))),
      AppCard(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TournamentPage(admin: admin))),
        child: Row(children: [
          const IconBubble(Icons.emoji_events_rounded, bg: C.softAmber, fg: C.amber, size: 52),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Ganda Seimbang Open', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
              const SizedBox(height: 3),
              const Text('27–28 Sep · 3 lapangan · 8 pasangan', style: TextStyle(color: C.mut, fontSize: 12.5)),
              const SizedBox(height: 8),
              ClipRRect(borderRadius: BorderRadius.circular(6), child: const LinearProgressIndicator(value: .4, minHeight: 6, backgroundColor: C.line, color: C.blue)),
            ]),
          ),
        ]),
      ),
      const SectionTitle('Pengumuman'),
      AppCard(
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: const [
          IconBubble(Icons.campaign_rounded, bg: C.softTeal, fg: C.teal, size: 40),
          SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Karpet lapangan 2 sudah diganti', style: TextStyle(fontWeight: FontWeight.w800)),
              SizedBox(height: 3),
              Text('Silakan mencoba. Laporkan bila ada kendala.', style: TextStyle(color: C.mut, fontSize: 13)),
            ]),
          ),
        ]),
      ),
    ]);
  }

  Widget _att(IconData i, String t, String s, Color bg, Color fg) => ListTile(
        leading: IconBubble(i, bg: bg, fg: fg, size: 40),
        title: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        subtitle: Text(s, style: const TextStyle(fontSize: 12.5)),
        trailing: const Icon(Icons.chevron_right_rounded, color: C.mut),
      );
}
