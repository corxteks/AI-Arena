import 'package:flutter/material.dart';
import 'ui.dart';
import 'data.dart';
import 'auth.dart';

class RankingPage extends StatelessWidget {
  const RankingPage({super.key});
  @override
  Widget build(BuildContext context) {
    final top = players.take(3).toList();
    return ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
      const Text('Peringkat', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
      const SizedBox(height: 16),
      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: _podium(top[1], 2, 96)),
        Expanded(child: _podium(top[0], 1, 128)),
        Expanded(child: _podium(top[2], 3, 78)),
      ]),
      const SizedBox(height: 16),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 3; i < players.length; i++) ...[
            ListTile(
              leading: SizedBox(width: 60, child: Row(children: [Text('${i + 1}', style: const TextStyle(fontWeight: FontWeight.w900, color: C.mut)), const SizedBox(width: 10), Avatar(players[i].initials, size: 34)])),
              title: Text(players[i].name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              subtitle: Text(players[i].pb, style: const TextStyle(fontSize: 12)),
              trailing: Text('${players[i].elo}', style: const TextStyle(fontWeight: FontWeight.w900, color: C.blue)),
            ),
            if (i < players.length - 1) const Divider(height: 1, color: C.line),
          ],
        ]),
      ),
    ]);
  }

  Widget _podium(Player p, int rank, double h) => Column(children: [
        Avatar(p.initials, size: rank == 1 ? 58 : 48, bg: rank == 1 ? C.softAmber : C.softBlue, fg: rank == 1 ? C.amber : C.blue),
        const SizedBox(height: 6),
        Text(p.name.split(' ').first, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        Text('${p.elo}', style: const TextStyle(color: C.mut, fontSize: 12, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Container(
          height: h,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          alignment: Alignment.topCenter,
          padding: const EdgeInsets.only(top: 10),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: rank == 1 ? [C.blue, C.blue2] : [C.softBlue, const Color(0xFFF3F6FF)], begin: Alignment.topCenter, end: Alignment.bottomCenter),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Text('$rank', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: rank == 1 ? Colors.white : C.blue)),
        ),
      ]);
}

class ChatPage extends StatelessWidget {
  const ChatPage({super.key});
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
        Row(children: [
          const Expanded(child: Text('Obrolan', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900))),
          GestureDetector(
            onTap: () => showActions(context, title: 'Kelola', items: [
              ActionItem(Icons.campaign_rounded, 'Pengumuman', onTap: () => snack(context, 'Pengumuman (pratinjau)')),
              ActionItem(Icons.flag_outlined, 'Laporan', onTap: () => snack(context, 'Laporan (pratinjau)')),
              ActionItem(Icons.dataset_outlined, 'Isi data contoh', onTap: () => snack(context, 'Data contoh terisi')),
            ]),
            child: const IconBubble(Icons.tune_rounded, bg: Colors.white, fg: C.ink, size: 42),
          ),
        ]),
        const SizedBox(height: 14),
        const TextField(decoration: InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari obrolan')),
        const SizedBox(height: 14),
        for (final c in chats)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatRoom(c))),
              child: Row(children: [
                c.group ? const IconBubble(Icons.groups_rounded, size: 46) : Avatar(c.name.substring(0, 2), size: 46),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(c.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(c.last, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: C.mut, fontSize: 12.5)),
                  ]),
                ),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(c.time, style: const TextStyle(color: C.mut, fontSize: 11.5)),
                  const SizedBox(height: 5),
                  if (c.unread > 0)
                    Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2), decoration: BoxDecoration(color: C.blue, borderRadius: BorderRadius.circular(10)), child: Text('${c.unread}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800))),
                ]),
              ]),
            ),
          ),
      ]);
}

class ChatRoom extends StatelessWidget {
  final Chat c;
  const ChatRoom(this.c, {super.key});
  @override
  Widget build(BuildContext context) {
    Widget bubble(String t, bool me) => Align(
          alignment: me ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            constraints: const BoxConstraints(maxWidth: 270),
            decoration: BoxDecoration(color: me ? C.blue : Colors.white, borderRadius: BorderRadius.circular(18)),
            child: Text(t, style: TextStyle(color: me ? Colors.white : C.ink, fontWeight: FontWeight.w600)),
          ),
        );
    return Scaffold(
      appBar: AppBar(title: Text(c.name)),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        bubble(c.last, false),
        bubble('Siap, ikut ya!', true),
        bubble('Oke, dicatat.', false),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
          child: Row(children: [
            const Expanded(child: TextField(decoration: InputDecoration(hintText: 'Tulis pesan'))),
            const SizedBox(width: 8),
            IconButton.filled(onPressed: () {}, icon: const Icon(Icons.send_rounded), style: IconButton.styleFrom(backgroundColor: C.blue, minimumSize: const Size(50, 50))),
          ]),
        ),
      ),
    );
  }
}

class ProfilePage extends StatelessWidget {
  final bool admin;
  const ProfilePage({super.key, required this.admin});
  @override
  Widget build(BuildContext context) {
    Widget item(IconData i, String t, VoidCallback f, {String? sub}) => ListTile(
          onTap: f,
          leading: IconBubble(i, size: 40),
          title: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          subtitle: sub == null ? null : Text(sub, style: const TextStyle(fontSize: 12)),
          trailing: const Icon(Icons.chevron_right_rounded, color: C.mut),
        );
    return ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
      const SizedBox(height: 8),
      Center(child: Column(children: [
        const Avatar('BR', size: 82),
        const SizedBox(height: 10),
        Text(admin ? 'Pengelola GOR' : 'Budi Rahman', style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, children: const [Pill('Level B'), Pill('PB Rajawali', bg: C.softTeal, fg: C.teal)]),
      ])),
      const SizedBox(height: 18),
      Row(children: [
        for (final s in const [('1216', 'ELO'), ('24', 'Menang'), ('11', 'Kalah')])
          Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: AppCard(padding: const EdgeInsets.symmetric(vertical: 14), child: Column(children: [Text(s.$1, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)), Text(s.$2, style: const TextStyle(color: C.mut, fontSize: 12))])))),
      ]),
      const SizedBox(height: 16),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          item(Icons.groups_rounded, 'PB dan anggota', () => Navigator.push(context, MaterialPageRoute(builder: (_) => ClubPage(admin: admin))), sub: '3 PB terdaftar'),
          const Divider(height: 1, color: C.line),
          item(Icons.photo_library_outlined, 'Galeri', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GalleryPage()))),
          const Divider(height: 1, color: C.line),
          item(Icons.settings_outlined, 'Pengaturan', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage()))),
        ]),
      ),
      const SizedBox(height: 16),
      Btn('Keluar', outlined: true, color: C.red, onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginPage()))),
    ]);
  }
}

class ClubPage extends StatelessWidget {
  final bool admin;
  const ClubPage({super.key, required this.admin});
  @override
  Widget build(BuildContext context) => Screen(title: 'PB dan anggota', children: [
        for (final c in clubs)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Avatar(c.name.split(' ').last.substring(0, 2).toUpperCase(), size: 46),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(c.name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)), Text('Ketua ${c.leader} · ${c.members} anggota', style: const TextStyle(color: C.mut, fontSize: 12.5))])),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  Pill('Kode ${c.code}', icon: Icons.vpn_key_rounded),
                  const SizedBox(width: 8),
                  if (c.invites > 0) Pill('${c.invites} menunggu', bg: C.softAmber, fg: C.amber),
                ]),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => _addMember(context, c),
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                  label: const Text('Tambah anggota'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                ),
              ]),
            ),
          ),
      ]);

  void _addMember(BuildContext context, Club c) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (b) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(b).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Tambah anggota ${c.name}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          const Text('Cukup nama. Anggota diterima otomatis saat bergabung dengan nama yang sama.', style: TextStyle(color: C.mut, fontSize: 13)),
          const SizedBox(height: 14),
          const TextField(decoration: InputDecoration(hintText: 'Nama anggota')),
          const SizedBox(height: 14),
          Btn('Simpan', onTap: () {
            Navigator.pop(b);
            snack(context, 'Anggota dicatat');
          }),
        ]),
      ),
    );
  }
}

class GalleryPage extends StatelessWidget {
  const GalleryPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Galeri')),
        body: GridView.count(
          padding: const EdgeInsets.all(18),
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: [
            for (var i = 0; i < 6; i++)
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(colors: [[C.blue, C.blue2], [C.teal, C.blue2], [C.amber, C.red]][i % 3], begin: Alignment.topLeft, end: Alignment.bottomRight),
                ),
                alignment: Alignment.bottomLeft,
                padding: const EdgeInsets.all(12),
                child: Text(['Final 2025', 'Mabar Jumat', 'Latihan PB', 'Juara Ganda', 'Karpet baru', 'Buka bersama'][i], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
              ),
          ],
        ),
      );
}

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool n1 = true, n2 = true, n3 = false;
  @override
  Widget build(BuildContext context) => Screen(title: 'Pengaturan', children: [
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            SwitchListTile(value: n1, activeColor: C.blue, onChanged: (v) => setState(() => n1 = v), title: const Text('Panggilan pertandingan', style: TextStyle(fontWeight: FontWeight.w700))),
            const Divider(height: 1, color: C.line),
            SwitchListTile(value: n2, activeColor: C.blue, onChanged: (v) => setState(() => n2 = v), title: const Text('Pengumuman GOR', style: TextStyle(fontWeight: FontWeight.w700))),
            const Divider(height: 1, color: C.line),
            SwitchListTile(value: n3, activeColor: C.blue, onChanged: (v) => setState(() => n3 = v), title: const Text('Mode gelap', style: TextStyle(fontWeight: FontWeight.w700))),
          ]),
        ),
      ]);
}
