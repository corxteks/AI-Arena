import 'package:flutter/material.dart';

class C {
  static const blue = Color(0xFF2F4EF0);
  static const blue2 = Color(0xFF4B8CF7);
  static const teal = Color(0xFF2FB9A3);
  static const ink = Color(0xFF111B3A);
  static const mut = Color(0xFF7B86A1);
  static const bg = Color(0xFFF1F4FA);
  static const line = Color(0xFFE9EDF6);
  static const red = Color(0xFFEF4C5B);
  static const amber = Color(0xFFF5A524);
  static const navy = Color(0xFF0F1636);
  static const softBlue = Color(0xFFE7EDFF);
  static const softTeal = Color(0xFFDFF6F1);
  static const softRed = Color(0xFFFFE9EB);
  static const softAmber = Color(0xFFFFF1D6);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: C.blue, primary: C.blue, surface: Colors.white),
    scaffoldBackgroundColor: C.bg,
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: C.ink, displayColor: C.ink),
    appBarTheme: const AppBarTheme(
      backgroundColor: C.bg, elevation: 0, scrolledUnderElevation: 0, centerTitle: false,
      titleTextStyle: TextStyle(color: C.ink, fontSize: 18, fontWeight: FontWeight.w800),
      iconTheme: IconThemeData(color: C.ink),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white, indicatorColor: C.softBlue, height: 66,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
          fontSize: 11, fontWeight: FontWeight.w700, color: s.contains(WidgetState.selected) ? C.blue : C.mut)),
      iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(color: s.contains(WidgetState.selected) ? C.blue : C.mut, size: 24)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.blue, width: 1.6)),
    ),
  );
}

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color color;
  final Border? border;
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.onTap, this.color = Colors.white, this.border});
  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: border ?? Border.all(color: C.line),
            boxShadow: const [BoxShadow(color: Color(0x0F1E2D6E), blurRadius: 14, offset: Offset(0, 5))],
          ),
          child: child,
        ),
      ),
    );
  }
}

class Pill extends StatelessWidget {
  final String text;
  final Color bg, fg;
  final IconData? icon;
  const Pill(this.text, {super.key, this.bg = C.softBlue, this.fg = C.blue, this.icon});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: fg, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ]),
      );
}

class Btn extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final bool outlined;
  final Color color;
  final IconData? icon;
  const Btn(this.label, {super.key, this.onTap, this.outlined = false, this.color = C.blue, this.icon});
  @override
  Widget build(BuildContext context) {
    final child = Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
      Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
    ]);
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: outlined
          ? OutlinedButton(
              onPressed: onTap,
              style: OutlinedButton.styleFrom(
                  foregroundColor: color, side: BorderSide(color: color, width: 1.5),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              child: child)
          : FilledButton(
              onPressed: onTap,
              style: FilledButton.styleFrom(
                  backgroundColor: color, foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              child: child),
    );
  }
}

class SectionTitle extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const SectionTitle(this.title, {super.key, this.action, this.onAction});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 10),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          if (action != null)
            GestureDetector(onTap: onAction, child: Text(action!, style: const TextStyle(color: C.blue, fontWeight: FontWeight.w700, fontSize: 13))),
        ]),
      );
}

class Avatar extends StatelessWidget {
  final String text;
  final double size;
  final Color bg, fg;
  const Avatar(this.text, {super.key, this.size = 42, this.bg = C.softBlue, this.fg = C.blue});
  @override
  Widget build(BuildContext context) => Container(
        width: size, height: size,
        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
        alignment: Alignment.center,
        child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: size * .34)),
      );
}

class IconBubble extends StatelessWidget {
  final IconData icon;
  final Color bg, fg;
  final double size;
  const IconBubble(this.icon, {super.key, this.bg = C.softBlue, this.fg = C.blue, this.size = 44});
  @override
  Widget build(BuildContext context) => Container(
        width: size, height: size,
        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
        child: Icon(icon, color: fg, size: size * .5),
      );
}

class Seg extends StatelessWidget {
  final List<String> items;
  final int index;
  final ValueChanged<int> onChanged;
  const Seg(this.items, this.index, this.onChanged, {super.key});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: C.line)),
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++)
              Expanded(
                child: GestureDetector(
                  onTap: () => onChanged(i),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(color: i == index ? C.blue : Colors.transparent, borderRadius: BorderRadius.circular(11)),
                    alignment: Alignment.center,
                    child: Text(items[i], style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: i == index ? Colors.white : C.mut)),
                  ),
                ),
              ),
          ],
        ),
      );
}

class ActionItem {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool danger;
  const ActionItem(this.icon, this.label, {this.onTap, this.danger = false});
}

Future<void> showActions(BuildContext context, {required String title, String? subtitle, required List<ActionItem> items}) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.white,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(subtitle, style: const TextStyle(color: C.mut))),
          const SizedBox(height: 8),
          for (final a in items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: IconBubble(a.icon, bg: a.danger ? C.softRed : C.softBlue, fg: a.danger ? C.red : C.blue, size: 40),
              title: Text(a.label, style: TextStyle(fontWeight: FontWeight.w700, color: a.danger ? C.red : C.ink)),
              onTap: () {
                Navigator.pop(c);
                a.onTap?.call();
              },
            ),
        ]),
      ),
    ),
  );
}

void snack(BuildContext c, String m) {
  ScaffoldMessenger.of(c).hideCurrentSnackBar();
  ScaffoldMessenger.of(c).showSnackBar(SnackBar(
    content: Text(m, style: const TextStyle(fontWeight: FontWeight.w600)),
    behavior: SnackBarBehavior.floating,
    backgroundColor: C.navy,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    duration: const Duration(milliseconds: 1600),
  ));
}

class Screen extends StatelessWidget {
  final String title;
  final List<Widget> children;
  final Widget? bottom;
  final List<Widget>? actions;
  const Screen({super.key, required this.title, required this.children, this.bottom, this.actions});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title), actions: actions),
        body: ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 24), children: children),
        bottomNavigationBar: bottom == null
            ? null
            : SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(18, 8, 18, 12), child: bottom)),
      );
}
