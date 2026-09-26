import 'package:flutter/material.dart';

class Court {
  final int no;
  final String? a, b;
  final int sa, sb, game, minutes;
  final String? umpire;
  final String next, nextTime, est;
  final int calls;
  const Court(this.no, {this.a, this.b, this.sa = 0, this.sb = 0, this.game = 1, this.minutes = 0, this.umpire, required this.next, required this.nextTime, required this.est, this.calls = 0});
  bool get live => a != null;
}

const courts = [
  Court(1, a: 'Budi / Citra', b: 'Eko / Fajar', sa: 21, sb: 17, game: 2, minutes: 34, umpire: 'Indah Sari', next: 'Vino / Wahyu vs Elang / Fira', nextTime: '10.00', est: '10.10', calls: 0),
  Court(2, a: 'Gita / Hendra', b: 'Kiki / Lina', sa: 14, sb: 11, game: 1, minutes: 22, umpire: 'Andi Saputra', next: 'Budi / Citra vs Eko / Fajar', nextTime: '16.50', est: '17.05', calls: 1),
  Court(3, next: 'Arga / Bella vs Malik / Nadin', nextTime: '18.20', est: '18.20', calls: 0),
];

class Pair {
  final String a, b, levels;
  final int value;
  final int? seed;
  final bool paid, guest;
  const Pair(this.a, this.b, this.levels, this.value, {this.seed, this.paid = true, this.guest = false});
  String get name => '$a / $b';
}

const pairs = [
  Pair('Arga', 'Bella', 'A + E', 6, seed: 1),
  Pair('Cakra', 'Dinda', 'A + E', 6, seed: 2),
  Pair('Elang', 'Fira', 'A + E', 6),
  Pair('Gading', 'Hana', 'B + D', 6),
  Pair('Ivan', 'Jihan', 'B + D', 6, paid: false),
  Pair('Kenzo', 'Luna', 'B + D', 6),
  Pair('Malik', 'Nadin', 'C + C', 6, guest: true),
  Pair('Oscar', 'Pita', 'C + C', 6),
];

class Player {
  final String name, pb, level;
  final int elo;
  const Player(this.name, this.pb, this.level, this.elo);
  String get initials => name.split(' ').map((e) => e[0]).take(2).join();
}

const players = [
  Player('Citra Lestari', 'PB Rajawali', 'A', 1612),
  Player('Eko Prasetyo', 'PB Garuda', 'A', 1588),
  Player('Joko Susilo', 'PB Kilat', 'B', 1471),
  Player('Budi Rahman', 'PB Rajawali', 'B', 1216),
  Player('Hendra Wijaya', 'PB Garuda', 'D', 1180),
  Player('Indah Sari', 'PB Kilat', 'D', 1153),
  Player('Dewi Anggraini', 'PB Rajawali', 'E', 1044),
];

class Unpaired {
  final String name, level;
  const Unpaired(this.name, this.level);
}

const unpaired = [
  Unpaired('Kevin Adiputra', 'A'),
  Unpaired('Lina Marlina', 'E'),
  Unpaired('Raka Wibowo', 'B'),
  Unpaired('Dimas Aryo', 'D'),
  Unpaired('Tegar Nugraha', 'C'),
  Unpaired('Lulu Anggun', 'C'),
];

const levelPts = {'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1};

Color levelColor(String l) => switch (l) {
      'A' => const Color(0xFF7C3AED),
      'B' => const Color(0xFF2F4EF0),
      'C' => const Color(0xFF16A34A),
      'D' => const Color(0xFF84A21A),
      _ => const Color(0xFF64748B),
    };

class Club {
  final String name, code, leader;
  final int members, invites;
  const Club(this.name, this.code, this.leader, this.members, this.invites);
}

const clubs = [
  Club('PB Rajawali', 'RAJ-4821', 'Budi Rahman', 12, 3),
  Club('PB Garuda', 'GAR-1093', 'Eko Prasetyo', 9, 0),
  Club('PB Kilat', 'KIL-7734', 'Joko Susilo', 7, 2),
];

class Chat {
  final String name, last, time;
  final int unread;
  final bool group;
  const Chat(this.name, this.last, this.time, this.unread, {this.group = true});
}

const chats = [
  Chat('Lounge GOR', 'Malam semua, ada yang mau mabar Sabtu?', '19.02', 3),
  Chat('PB Rajawali', 'Jangan lupa iuran bulan ini ya', '18.40', 1),
  Chat('Pengumuman', 'Karpet lapangan 2 sudah diganti', 'Kemarin', 0),
  Chat('Citra Lestari', 'Siap, sampai ketemu di Lap 2', 'Kemarin', 0, group: false),
];
