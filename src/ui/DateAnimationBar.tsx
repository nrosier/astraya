/**
 * The slim "media player" bar above the wheel and tables of the Transits and Progressions screens (#1400): play or
 * pause, step back, the step interval, the date, step forward, the speed, a slider over ten years, and Now.
 *
 * It owns no calculation. Every change (a step, a tick of playback, the slider, Now, a typed date) goes out through
 * `onDateChange`, which is the screen's own as-of setter, so the chart recalculates on the same engine path as typing a date.
 */
/**
 * @module ui/DateAnimationBar
 * @purpose Date stepper and animation control bar: play/pause, back, Day/Month/Year interval, date, forward, speed, slider and Now.
 * @conventions Controlled by `date`/`onDateChange` (YYYY-MM-DD); playback always starts paused, whatever the motion preference, and only a press of Play advances it; arithmetic lives in date-animation.ts; Space and the arrow keys act from anywhere except inside an input, select or text area (where they keep their native meaning); tokens only, no new colours or spacing.
 * @exports DateAnimationBar
 */
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button } from './primitives/Button.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { DateField } from './primitives/DateField.js';
import { Select } from './primitives/Select.js';
import { dateAnimationBarMessages } from './DateAnimationBar.messages.js';
import {
  DEFAULT_INTERVAL,
  DEFAULT_SPEED,
  PLAYBACK_SPEEDS,
  STEP_INTERVALS,
  advanceDate,
  dayNumber,
  isoFromDayNumber,
  playbackPlan,
  sliderSpan,
  type StepInterval,
} from './date-animation.js';
import { formatCivilDate, todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';

/** The slider's centre year for `date`, kept inside the range the slider can span. */
function centerYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year >= 6 && year <= 9994 ? year : new Date().getFullYear();
}

/** True for an element where Space and the arrows already mean something (typing, choosing, dragging). */
function keepsNativeKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('input, select, textarea') !== null) return true;
  // A focused button or link takes Space as its own click; arrows have no native meaning there.
  return key === ' ' && target.closest('button, a[href]') !== null;
}

export function DateAnimationBar({
  date,
  onDateChange,
}: {
  readonly date: string;
  readonly onDateChange: (date: string) => void;
}): React.JSX.Element {
  const t = useMessages(dateAnimationBarMessages);
  const [locale] = useLocale();
  const [interval, setInterval_] = useState<StepInterval>(DEFAULT_INTERVAL);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  // Always paused on arrival, with reduced motion or without: nothing moves until Play is pressed.
  const [playing, setPlaying] = useState(false);
  const [centerYear, setCenterYear] = useState(() => centerYearOf(date));

  // The date the next tick starts from, which may be ahead of the render while a recalculation is in flight.
  const latestDate = useRef(date);
  useEffect(() => {
    latestDate.current = date;
  }, [date]);

  const valid = dayNumber(date) !== undefined;

  const stepBy = (steps: number): void => {
    const next = advanceDate(latestDate.current, interval, steps);
    if (next === latestDate.current) {
      setPlaying(false);
      return;
    }
    latestDate.current = next;
    onDateChange(next);
  };
  // The effects below read the latest interval and handler through this, so a tick never uses a stale one.
  const stepFromEffect = useEffectEvent((steps: number): void => {
    stepBy(steps);
  });

  useEffect(() => {
    if (!playing) return undefined;
    const { tickMs, stepsPerTick } = playbackPlan(speed);
    const timer = window.setInterval(() => {
      stepFromEffect(Math.max(1, Math.round(stepsPerTick)));
    }, tickMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, speed]);

  const onKey = useEffectEvent((event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (keepsNativeKeys(event.target, event.key)) return;
    if (event.key === ' ') {
      event.preventDefault();
      setPlaying((value) => !value);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepFromEffect(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      onKey(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);

  // A date outside the ten years shown re-centres the slider on its year.
  const current = dayNumber(date);
  const span = sliderSpan(centerYear);
  if (current !== undefined && (current < span.min || current > span.max)) setCenterYear(centerYearOf(date));

  const intervalName = t.intervalNames[interval];
  return (
    <div className="date-animation-bar-wrap">
      <div className="date-animation-bar" role="group" aria-label={t.groupLabel}>
        <Button
          variant="primary"
          className="date-animation-play"
          aria-pressed={playing}
          aria-label={playing ? t.pause : t.play}
          onClick={() => {
            setPlaying((value) => !value);
          }}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </Button>
        <Button
          className="date-animation-step"
          aria-label={t.stepBack(intervalName)}
          disabled={!valid}
          onClick={() => {
            stepBy(-1);
          }}
        >
          <span aria-hidden="true">◀</span>
        </Button>
        <ChoiceGroup
          segmented
          label={t.intervalLabel}
          value={interval}
          options={STEP_INTERVALS.map((value) => ({ value, label: t.intervalOptions[value] }))}
          onChange={(value) => {
            const next = STEP_INTERVALS.find((candidate) => candidate === value);
            if (next !== undefined) setInterval_(next);
          }}
        />
        <DateField label={t.dateLabel} value={date} onChange={onDateChange} hideLabel />
        <Button
          className="date-animation-step"
          aria-label={t.stepForward(intervalName)}
          disabled={!valid}
          onClick={() => {
            stepBy(1);
          }}
        >
          <span aria-hidden="true">▶</span>
        </Button>
        <Select
          hideLabel
          label={t.speedLabel}
          value={String(speed)}
          options={PLAYBACK_SPEEDS.map((value) => ({ value: String(value), label: `${String(value)}x` }))}
          onChange={(value) => {
            const next = PLAYBACK_SPEEDS.find((candidate) => String(candidate) === value);
            if (next !== undefined) setSpeed(next);
          }}
        />
        <div className="date-animation-scrub">
          <input
            type="range"
            min={span.min}
            max={span.max}
            step={1}
            value={current === undefined ? span.min : Math.min(Math.max(current, span.min), span.max)}
            disabled={!valid}
            aria-label={t.sliderLabel}
            aria-valuetext={
              valid
                ? formatCivilDate(
                    { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) },
                    locale,
                  )
                : undefined
            }
            onChange={(event) => {
              const days = Number(event.target.value);
              if (Number.isFinite(days)) {
                latestDate.current = isoFromDayNumber(days);
                onDateChange(latestDate.current);
              }
            }}
          />
          <div className="date-animation-ticks" aria-hidden="true">
            <span>{centerYear - 5}</span>
            <span>{centerYear}</span>
            <span>{centerYear + 5}</span>
          </div>
        </div>
        <Button
          className="date-animation-now"
          onClick={() => {
            onDateChange(todayInputValue());
          }}
        >
          {t.now}
        </Button>
      </div>
      <p className="hint date-animation-hint">{t.hint}</p>
    </div>
  );
}
