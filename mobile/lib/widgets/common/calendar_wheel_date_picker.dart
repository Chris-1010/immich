import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

/// Shows the Material calendar date picker with a row of spinning wheels under the calendar for
/// setting the day, month, year and time in one line.
///
/// The calendar and the wheels follow each other: a date picked on one animates the other to it.
/// Returns the picked date carrying the time set on the wheels, or null when cancelled.
///
/// In landscape there is no room for the wheels, so the standard date picker is shown instead and
/// the returned date carries [initialTime].
Future<DateTime?> showCalendarWheelDatePicker({
  required BuildContext context,
  required DateTime initialDate,
  required TimeOfDay initialTime,
  required DateTime firstDate,
  required DateTime lastDate,
  Locale? locale,
  TransitionBuilder? builder,
}) async {
  if (MediaQuery.orientationOf(context) == Orientation.landscape) {
    final date = await showDatePicker(
      context: context,
      locale: locale,
      builder: builder,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: lastDate,
    );
    return date == null ? null : _withTime(date, initialTime);
  }

  return showDialog<DateTime>(
    context: context,
    builder: (context) {
      Widget dialog = _CalendarWheelDatePickerDialog(
        initialDate: DateUtils.dateOnly(initialDate),
        initialTime: initialTime,
        firstDate: DateUtils.dateOnly(firstDate),
        lastDate: DateUtils.dateOnly(lastDate),
      );
      if (locale != null) {
        dialog = Localizations.override(context: context, locale: locale, child: dialog);
      }
      return builder == null ? dialog : builder(context, dialog);
    },
  );
}

DateTime _withTime(DateTime date, TimeOfDay time) => DateTime(date.year, date.month, date.day, time.hour, time.minute);

// Sizes of Flutter's Material 3 date picker dialog, kept so this dialog matches it.
const Size _calendarPortraitDialogSize = Size(360.0, 568.0);
const Size _inputPortraitDialogSize = Size(328.0, 270.0);
const double _headerHeight = 120.0;
const double _actionsHeight = 52.0;
const double _calendarSubHeaderHeight = 52.0;
const double _calendarDayRowHeight = 48.0;
const int _calendarMaxRows = 6;
const double _maxTextScale = 3.0;
const double _maxHeaderTextScale = 1.4;

const double _wheelItemExtent = 36.0;
const int _wheelVisibleItems = 3;
const double _maxWheelTextScale = 1.3;
const double _wheelVerticalPadding = 8.0;

class _CalendarWheelDatePickerDialog extends StatefulWidget {
  final DateTime initialDate;
  final TimeOfDay initialTime;
  final DateTime firstDate;
  final DateTime lastDate;

  const _CalendarWheelDatePickerDialog({
    required this.initialDate,
    required this.initialTime,
    required this.firstDate,
    required this.lastDate,
  });

  @override
  State<_CalendarWheelDatePickerDialog> createState() => _CalendarWheelDatePickerDialogState();
}

class _CalendarWheelDatePickerDialogState extends State<_CalendarWheelDatePickerDialog> {
  final _formKey = GlobalKey<FormState>();
  late DateTime _selected = widget.initialDate;
  late TimeOfDay _time = widget.initialTime;
  bool _inputMode = false;
  AutovalidateMode _autovalidateMode = AutovalidateMode.disabled;

  /// Bumped when the wheels pick a date, which rebuilds the calendar on it since the calendar
  /// cannot be moved from outside.
  int _calendarRevision = 0;

  /// Which way the rebuilt calendar slides in: 1 for a later month, -1 for an earlier one, 0 for
  /// the same month.
  int _calendarSlide = 0;

  void _handleCalendarDateChanged(DateTime date) => setState(() => _selected = date);

  void _handleWheelDateChanged(DateTime date) {
    if (DateUtils.isSameDay(date, _selected)) return;
    final monthDelta = DateUtils.monthDelta(_selected, date);
    setState(() {
      _calendarSlide = monthDelta.sign;
      _calendarRevision++;
      _selected = date;
    });
  }

  void _handleEntryModeToggle() {
    setState(() {
      if (_inputMode) {
        _formKey.currentState!.save();
      } else {
        _autovalidateMode = AutovalidateMode.disabled;
      }
      _inputMode = !_inputMode;
    });
  }

  void _handleOk() {
    if (_inputMode) {
      final form = _formKey.currentState!;
      if (!form.validate()) {
        setState(() => _autovalidateMode = AutovalidateMode.always);
        return;
      }
      form.save();
    }
    Navigator.pop(context, _withTime(_selected, _time));
  }

  double _textScale(BuildContext context, double max) =>
      MediaQuery.textScalerOf(context).clamp(maxScaleFactor: max).scale(14) / 14;

  /// The calendar dialog's height: the standard picker's, unless that leaves too little room
  /// under the calendar for the wheels.
  double _calendarDialogHeight(BuildContext context) {
    final textScale = _textScale(context, _maxTextScale);
    final headerScale = _textScale(context, _maxHeaderTextScale);
    final header = _headerHeight * (headerScale > 1.3 ? headerScale - 0.2 : 1.0);
    final calendarRows = _calendarDayRowHeight * (_calendarMaxRows + 1);
    final calendar =
        _calendarSubHeaderHeight + calendarRows + (textScale > 1.3 ? (_calendarMaxRows + 1) * (textScale - 1) * 8 : 0);
    final wheels =
        _wheelItemExtent * _wheelVisibleItems * _textScale(context, _maxWheelTextScale) + _wheelVerticalPadding * 2;
    final needed = header + 1 + calendar + wheels + _actionsHeight;
    return math.max(_calendarPortraitDialogSize.height * textScale, needed);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final localizations = MaterialLocalizations.of(context);
    final datePickerTheme = DatePickerTheme.of(context);
    final defaults = DatePickerTheme.defaults(context);
    final headerForeground = datePickerTheme.headerForegroundColor ?? defaults.headerForegroundColor;
    final textScale = _textScale(context, _maxTextScale);

    final header = _Header(
      helpText: localizations.datePickerHelpText,
      titleText: localizations.formatMediumDate(_selected),
      entryModeButton: IconButton(
        icon: Icon(_inputMode ? Icons.calendar_today : Icons.edit_outlined),
        color: headerForeground,
        tooltip: _inputMode ? localizations.calendarModeButtonLabel : localizations.inputDateModeButtonLabel,
        onPressed: _handleEntryModeToggle,
      ),
    );

    final actions = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: _actionsHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Align(
          alignment: AlignmentDirectional.centerEnd,
          child: OverflowBar(
            spacing: 8,
            children: [
              TextButton(
                style: datePickerTheme.cancelButtonStyle ?? defaults.cancelButtonStyle,
                onPressed: () => Navigator.pop(context),
                child: Text(localizations.cancelButtonLabel),
              ),
              TextButton(
                style: datePickerTheme.confirmButtonStyle ?? defaults.confirmButtonStyle,
                onPressed: _handleOk,
                child: Text(localizations.okButtonLabel),
              ),
            ],
          ),
        ),
      ),
    );

    final Widget picker;
    final Size dialogSize;
    if (_inputMode) {
      dialogSize = _inputPortraitDialogSize * textScale;
      picker = Form(
        key: _formKey,
        autovalidateMode: _autovalidateMode,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: MediaQuery.withClampedTextScaling(
                  maxScaleFactor: 2.0,
                  child: InputDatePickerFormField(
                    initialDate: _selected,
                    firstDate: widget.firstDate,
                    lastDate: widget.lastDate,
                    onDateSubmitted: _handleCalendarDateChanged,
                    onDateSaved: _handleCalendarDateChanged,
                    autofocus: true,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    } else {
      dialogSize = Size(_calendarPortraitDialogSize.width * textScale, _calendarDialogHeight(context));
      picker = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRect(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              layoutBuilder: (current, previous) =>
                  Stack(alignment: Alignment.topCenter, children: [...previous, if (current != null) current]),
              transitionBuilder: (child, animation) {
                if (_calendarSlide == 0) {
                  return FadeTransition(opacity: animation, child: child);
                }
                final incoming = child.key == ValueKey(_calendarRevision);
                final begin = Offset((incoming ? 1.0 : -1.0) * _calendarSlide, 0);
                return SlideTransition(
                  position: Tween(
                    begin: begin,
                    end: Offset.zero,
                  ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
                  child: child,
                );
              },
              child: CalendarDatePicker(
                key: ValueKey(_calendarRevision),
                initialDate: _selected,
                firstDate: widget.firstDate,
                lastDate: widget.lastDate,
                onDateChanged: _handleCalendarDateChanged,
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: _DateTimeWheels(
                date: _selected,
                time: _time,
                firstDate: widget.firstDate,
                lastDate: widget.lastDate,
                onDateChanged: _handleWheelDateChanged,
                onTimeChanged: (time) => _time = time,
              ),
            ),
          ),
        ],
      );
    }

    return Dialog(
      backgroundColor: datePickerTheme.backgroundColor ?? defaults.backgroundColor,
      elevation: datePickerTheme.elevation ?? defaults.elevation,
      shadowColor: datePickerTheme.shadowColor ?? defaults.shadowColor,
      surfaceTintColor: datePickerTheme.surfaceTintColor ?? defaults.surfaceTintColor,
      shape: datePickerTheme.shape ?? defaults.shape,
      clipBehavior: Clip.antiAlias,
      child: AnimatedContainer(
        width: dialogSize.width,
        height: dialogSize.height,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeIn,
        child: MediaQuery.withClampedTextScaling(
          maxScaleFactor: _maxTextScale,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              header,
              if (theme.useMaterial3) Divider(height: 0, color: datePickerTheme.dividerColor),
              Expanded(child: picker),
              actions,
            ],
          ),
        ),
      ),
    );
  }
}

/// The help text and selected date above the picker, laid out like the standard picker's.
class _Header extends StatelessWidget {
  final String helpText;
  final String titleText;
  final Widget entryModeButton;

  const _Header({required this.helpText, required this.titleText, required this.entryModeButton});

  @override
  Widget build(BuildContext context) {
    final datePickerTheme = DatePickerTheme.of(context);
    final defaults = DatePickerTheme.defaults(context);
    final foreground = datePickerTheme.headerForegroundColor ?? defaults.headerForegroundColor;
    final helpStyle = (datePickerTheme.headerHelpStyle ?? defaults.headerHelpStyle)?.copyWith(color: foreground);
    final titleStyle = (datePickerTheme.headerHeadlineStyle ?? defaults.headerHeadlineStyle)?.copyWith(
      color: foreground,
    );
    final scale = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: _maxHeaderTextScale).scale(14) / 14;

    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: _maxHeaderTextScale,
      child: SizedBox(
        height: _headerHeight * (scale > 1.3 ? scale - 0.2 : 1.0),
        child: Material(
          color: datePickerTheme.headerBackgroundColor ?? defaults.headerBackgroundColor,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: 24, end: 12, bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                Text(helpText, style: helpStyle, maxLines: 1, overflow: TextOverflow.ellipsis),
                const Flexible(child: SizedBox(height: 38)),
                Row(
                  children: [
                    Expanded(
                      child: Text(titleText, style: titleStyle, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    entryModeButton,
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Day, month and year wheels on the left and hour, minute (and AM/PM) wheels on the right.
///
/// A date set from outside animates the date wheels to it, the month wheel turning the way the
/// date moved. A date set on the wheels is reported once they come to rest, pulled back within
/// [firstDate] and [lastDate] and to the last day of a shorter month.
class _DateTimeWheels extends StatefulWidget {
  final DateTime date;
  final TimeOfDay time;
  final DateTime firstDate;
  final DateTime lastDate;
  final ValueChanged<DateTime> onDateChanged;
  final ValueChanged<TimeOfDay> onTimeChanged;

  const _DateTimeWheels({
    required this.date,
    required this.time,
    required this.firstDate,
    required this.lastDate,
    required this.onDateChanged,
    required this.onTimeChanged,
  });

  @override
  State<_DateTimeWheels> createState() => _DateTimeWheelsState();
}

class _DateTimeWheelsState extends State<_DateTimeWheels> {
  late DateTime _shown = widget.date;
  late final _day = FixedExtentScrollController(initialItem: widget.date.day - 1);
  late final _month = FixedExtentScrollController(initialItem: widget.date.month - 1);
  late final _year = FixedExtentScrollController(initialItem: widget.date.year - widget.firstDate.year);
  FixedExtentScrollController? _hour;
  late final _minute = FixedExtentScrollController(initialItem: widget.time.minute);
  late final _period = FixedExtentScrollController(initialItem: widget.time.period.index);
  bool _use24Hour = false;

  /// Wheels currently being turned by code rather than by a finger, whose stops are not picks.
  int _animating = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _use24Hour = MediaQuery.alwaysUse24HourFormatOf(context);
    // 12-hour wheels list 12 first, so 12 o'clock is item 0.
    _hour ??= FixedExtentScrollController(initialItem: _use24Hour ? widget.time.hour : widget.time.hourOfPeriod);
  }

  @override
  void didUpdateWidget(_DateTimeWheels oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!DateUtils.isSameDay(widget.date, _shown)) {
      _animateTo(widget.date, from: _shown);
      _shown = widget.date;
    }
  }

  @override
  void dispose() {
    _day.dispose();
    _month.dispose();
    _year.dispose();
    _hour?.dispose();
    _minute.dispose();
    _period.dispose();
    super.dispose();
  }

  static int _wrap(int index, int count) => index % count;

  void _animateTo(DateTime target, {required DateTime from}) {
    final monthDelta = DateUtils.monthDelta(from, target);
    final currentMonth = _wrap(_month.selectedItem, 12);
    final monthSteps = switch (monthDelta.sign) {
      1 => _wrap(target.month - 1 - currentMonth, 12),
      -1 => -_wrap(currentMonth - (target.month - 1), 12),
      _ => 0,
    };
    final currentDay = _wrap(_day.selectedItem, 31);
    final daySteps = target.day - 1 - currentDay;
    final yearItem = target.year - widget.firstDate.year;
    final yearSteps = yearItem - _year.selectedItem;

    final steps = [monthSteps.abs(), daySteps.abs(), math.min(yearSteps.abs(), 12)].reduce(math.max);
    if (steps == 0) return;
    final duration = Duration(milliseconds: math.min(350 + steps * 45, 900));
    const curve = Curves.easeOutCubic;

    void turn(FixedExtentScrollController controller, int item) {
      if (!controller.hasClients || controller.selectedItem == item) return;
      _animating++;
      controller.animateToItem(item, duration: duration, curve: curve).whenComplete(() => _animating--);
    }

    turn(_month, _month.selectedItem + monthSteps);
    turn(_day, _day.selectedItem + daySteps);
    turn(_year, yearItem);
  }

  void _handleDateWheelSettled() {
    if (_animating > 0) return;
    final year = widget.firstDate.year + _year.selectedItem;
    final month = _wrap(_month.selectedItem, 12) + 1;
    final day = math.min(_wrap(_day.selectedItem, 31) + 1, DateUtils.getDaysInMonth(year, month));
    var date = DateTime(year, month, day);
    if (date.isBefore(widget.firstDate)) date = widget.firstDate;
    if (date.isAfter(widget.lastDate)) date = widget.lastDate;

    final wheelsMatch =
        _wrap(_day.selectedItem, 31) + 1 == date.day &&
        _wrap(_month.selectedItem, 12) + 1 == date.month &&
        _year.selectedItem == date.year - widget.firstDate.year;
    if (!wheelsMatch) {
      // Pull the wheels back onto the date that was actually picked.
      _animateTo(date, from: DateTime(year, month, _wrap(_day.selectedItem, 31) + 1));
    }
    if (!DateUtils.isSameDay(date, _shown)) {
      _shown = date;
      widget.onDateChanged(date);
    }
  }

  void _handleWheelTick() {
    if (_animating == 0) HapticFeedback.selectionClick();
  }

  void _handleTimeWheelSettled() {
    final hourItem = _hour!.selectedItem;
    final int hour;
    if (_use24Hour) {
      hour = _wrap(hourItem, 24);
    } else {
      hour = _wrap(hourItem, 12) + (_period.selectedItem == 1 ? 12 : 0);
    }
    widget.onTimeChanged(TimeOfDay(hour: hour, minute: _wrap(_minute.selectedItem, 60)));
  }

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final localeTag = Localizations.localeOf(context).toString();
    final monthFormat = DateFormat.localeExists(localeTag) ? DateFormat.MMM(localeTag) : DateFormat.MMM();
    final daysInMonth = DateUtils.getDaysInMonth(_shown.year, _shown.month);
    final yearCount = widget.lastDate.year - widget.firstDate.year + 1;
    final colors = Theme.of(context).colorScheme;
    String twoDigits(int value) => value.toString().padLeft(2, '0');

    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: _maxWheelTextScale,
      child: Builder(
        builder: (context) {
          final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
          final extent = _wheelItemExtent * scale;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: _wheelVerticalPadding),
            child: SizedBox(
              height: extent * _wheelVisibleItems,
              child: Row(
                children: [
                  _Wheel(
                    flex: 2,
                    controller: _day,
                    itemExtent: extent,
                    itemCount: 31,
                    looping: true,
                    label: (i) => twoDigits(i + 1),
                    // Days the month does not have are shown faded, and settle on its last day.
                    enabled: (i) => i < daysInMonth,
                    onSettled: _handleDateWheelSettled,
                    onChanged: _handleWheelTick,
                  ),
                  _Wheel(
                    flex: 3,
                    controller: _month,
                    itemExtent: extent,
                    itemCount: 12,
                    looping: true,
                    label: (i) => monthFormat.format(DateTime(2000, i + 1)),
                    onSettled: _handleDateWheelSettled,
                    onChanged: _handleWheelTick,
                  ),
                  _Wheel(
                    flex: 3,
                    controller: _year,
                    itemExtent: extent,
                    itemCount: yearCount,
                    label: (i) => '${widget.firstDate.year + i}',
                    onSettled: _handleDateWheelSettled,
                    onChanged: _handleWheelTick,
                  ),
                  const SizedBox(width: 12),
                  _Wheel(
                    flex: 2,
                    controller: _hour!,
                    itemExtent: extent,
                    itemCount: _use24Hour ? 24 : 12,
                    looping: true,
                    label: (i) => _use24Hour ? twoDigits(i) : '${i == 0 ? 12 : i}',
                    onSettled: _handleTimeWheelSettled,
                    onChanged: _handleWheelTick,
                  ),
                  Text(':', style: TextStyle(color: colors.onSurface, fontSize: 16)),
                  _Wheel(
                    flex: 2,
                    controller: _minute,
                    itemExtent: extent,
                    itemCount: 60,
                    looping: true,
                    label: twoDigits,
                    onSettled: _handleTimeWheelSettled,
                    onChanged: _handleWheelTick,
                  ),
                  if (!_use24Hour)
                    _Wheel(
                      flex: 2,
                      controller: _period,
                      itemExtent: extent,
                      itemCount: 2,
                      label: (i) =>
                          i == 0 ? localizations.anteMeridiemAbbreviation : localizations.postMeridiemAbbreviation,
                      onSettled: _handleTimeWheelSettled,
                      onChanged: _handleWheelTick,
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// One spinning column with lines above and below the selected item.
class _Wheel extends StatelessWidget {
  final int flex;
  final FixedExtentScrollController controller;
  final double itemExtent;
  final int itemCount;
  final bool looping;
  final String Function(int index) label;
  final bool Function(int index)? enabled;
  final VoidCallback onSettled;
  final VoidCallback onChanged;

  const _Wheel({
    required this.flex,
    required this.controller,
    required this.itemExtent,
    required this.itemCount,
    required this.label,
    required this.onSettled,
    required this.onChanged,
    this.looping = false,
    this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.titleMedium;
    final lineColor = colors.onSurface.withValues(alpha: 0.6);

    Widget item(int index) {
      final isEnabled = enabled?.call(index) ?? true;
      return Center(
        child: Text(
          label(index),
          style: style?.copyWith(color: isEnabled ? colors.onSurface : colors.onSurface.withValues(alpha: 0.3)),
        ),
      );
    }

    return Expanded(
      flex: flex,
      child: Stack(
        alignment: Alignment.center,
        children: [
          NotificationListener<ScrollEndNotification>(
            onNotification: (_) {
              onSettled();
              return false;
            },
            child: ListWheelScrollView.useDelegate(
              controller: controller,
              itemExtent: itemExtent,
              diameterRatio: 3,
              overAndUnderCenterOpacity: 0.4,
              physics: const FixedExtentScrollPhysics(),
              onSelectedItemChanged: (_) => onChanged(),
              childDelegate: looping
                  ? ListWheelChildLoopingListDelegate(children: List.generate(itemCount, item))
                  : ListWheelChildBuilderDelegate(childCount: itemCount, builder: (_, index) => item(index)),
            ),
          ),
          IgnorePointer(
            child: Container(
              height: itemExtent,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                border: Border.symmetric(horizontal: BorderSide(color: lineColor, width: 1.5)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
