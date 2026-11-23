import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FitnessService } from './fitness.service';

describe('FitnessService continuous weeks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-06T12:00:00'));
    TestBed.configureTestingModule({ providers: [FitnessService] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('extends past week 52 while preserving progress and the 10-week future horizon', async () => {
    const fitness = TestBed.inject(FitnessService);
    expect(fitness.state().weeks[0].workouts.map(workout => workout.day))
      .toEqual(['Monday', 'Wednesday', 'Friday']);
    expect(fitness.state().weeks[0].workouts.map(workout => workout.duration))
      .toEqual([30, 30, 30]);
    fitness.state.update(state => {
      const weeks = [...state.weeks];
      weeks[0] = {
        ...weeks[0],
        workouts: weeks[0].workouts.map((workout, index) =>
          index === 0 ? { ...workout, status: 'approved' } : workout
        ),
      };
      return { ...state, startDate: '2024-01-01', weeks };
    });

    vi.setSystemTime(new Date('2025-02-01T12:00:00'));
    await vi.advanceTimersByTimeAsync(60_000);

    const currentWeek = fitness.currentWeek();
    expect(currentWeek).toBeGreaterThan(52);
    expect(fitness.state().weeks).toHaveLength(currentWeek + 10);
    expect(fitness.visibleWeeks()).toHaveLength(currentWeek + 10);
    expect(fitness.state().weeks[0].workouts[0].status).toBe('approved');
    expect(fitness.state().weeks[currentWeek].number).toBe(currentWeek + 1);
    expect(fitness.state().weeks[currentWeek].startDate).toBe('2025-02-03');
  });
});
