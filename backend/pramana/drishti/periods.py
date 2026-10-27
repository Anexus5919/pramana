"""Period words to date windows in Asia/Kolkata, so no model ever does date arithmetic.

`kal` and `कल` mean yesterday: officials ask about things that already happened. The clock is injectable so tests
can freeze "today".
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

_clock: Callable[[], datetime] = lambda: datetime.now(UTC)  # noqa: E731


def set_clock(fn: Callable[[], datetime] | None) -> None:
    """Replace the clock (tests); None restores the real one."""
    global _clock
    _clock = fn or (lambda: datetime.now(UTC))


def now() -> datetime:
    return _clock().astimezone(IST)


def today() -> date:
    return now().date()


@dataclass
class Window:
    """[start, end) in IST; None means open. `first` and `last` are the calendar days it covers."""

    period: str | None
    start: datetime | None
    end: datetime | None
    first: date | None = None
    last: date | None = None

    def contains(self, ts: datetime | None) -> bool:
        if ts is None:
            return False
        ts = ts if ts.tzinfo else ts.replace(tzinfo=UTC)
        return (self.start is None or ts >= self.start) and (self.end is None or ts < self.end)

    @property
    def bounded(self) -> bool:
        return self.start is not None or self.end is not None


def _at(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=IST)


def _span(period: str | None, first: date, last: date) -> Window:
    return Window(period, _at(first), _at(last + timedelta(days=1)), first, last)


def window(period: str | None, date_from: str | None = None, date_to: str | None = None,
           ref: date | None = None) -> Window:
    """The window for a period word, or for explicit dates (which win). `this_session` and `all` are unbounded
    here; callers that know the session apply it themselves."""
    t = ref or today()
    if date_from or date_to:
        f = date.fromisoformat(date_from) if date_from else None
        to = date.fromisoformat(date_to) if date_to else None
        if f and to and to < f:
            f, to = to, f
        return Window(None, _at(f) if f else None, _at(to + timedelta(days=1)) if to else None, f, to)
    if period == "today":
        return _span(period, t, t)
    if period == "yesterday":
        y = t - timedelta(days=1)
        return _span(period, y, y)
    if period == "this_week":
        return _span(period, t - timedelta(days=t.weekday()), t)
    if period == "last_week":
        monday = t - timedelta(days=t.weekday())
        return _span(period, monday - timedelta(days=7), monday - timedelta(days=1))
    if period == "last_7_days":
        return _span(period, t - timedelta(days=6), t)
    if period == "this_month":
        return _span(period, t.replace(day=1), t)
    if period == "last_month":
        first_this = t.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return _span(period, last_prev.replace(day=1), last_prev)
    if period == "last_30_days":
        return _span(period, t - timedelta(days=29), t)
    return Window(period, None, None)
