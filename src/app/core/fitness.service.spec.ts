import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FitnessService } from './fitness.service';
import { supabase } from './supabase.client';

describe('FitnessService continuous weeks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-06T12:00:00'));
    TestBed.configureTestingModule({ providers: [FitnessService] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
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

  it('lets Dhani save custom details for an unsubmitted workout', async () => {
    const fitness = TestBed.inject(FitnessService);
    const rpc = vi.spyOn(supabase, 'rpc');
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: null }) as never);
    fitness.role.set('child');
    const workout = fitness.state().weeks[0].workouts[0];

    await expect(fitness.editChildWorkout(
      1,
      workout.id,
      'Bike ride',
      'I rode my bike around the park.',
      35,
      ['Warm up slowly', 'Ride with an adult'],
    )).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('edit_child_workout', {
      p_week_number: 1,
      p_workout_id: workout.id,
      p_title: 'Bike ride',
      p_description: 'I rode my bike around the park.',
      p_duration: 35,
      p_instructions: ['Warm up slowly', 'Ride with an adult'],
    });
    expect(fitness.state().weeks[0].workouts[0]).toMatchObject({
      title: 'Bike ride',
      description: 'I rode my bike around the park.',
      duration: 35,
      instructions: ['Warm up slowly', 'Ride with an adult'],
    });
  });

  it('rejects editing a workout after it has been submitted', async () => {
    const fitness = TestBed.inject(FitnessService);
    const rpc = vi.spyOn(supabase, 'rpc');
    fitness.role.set('child');
    fitness.state.update(state => ({
      ...state,
      weeks: state.weeks.map((week, index) => index === 0 ? {
        ...week,
        workouts: week.workouts.map((workout, workoutIndex) => workoutIndex === 0
          ? { ...workout, status: 'pending' }
          : workout),
      } : week),
    }));

    await expect(fitness.editChildWorkout(
      1,
      fitness.state().weeks[0].workouts[0].id,
      'Bike ride',
      'I rode my bike.',
      30,
      ['Ride safely'],
    )).resolves.toBe(false);

    expect(rpc).not.toHaveBeenCalled();
  });
});
